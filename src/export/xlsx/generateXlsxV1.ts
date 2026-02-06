
import type { ExportBundle, ExportArtifact, TabularData } from '../contracts/ExportBundle';
import type { XlsxOptions } from '../contracts/ExportOptions';

import { ZipWriter } from '../zip/zipWriter';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(colIndex0: number): string {
  let n = colIndex0 + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sanitizeSheetName(name: string): string {
  // Excel constraints: max 31 chars; cannot contain: : \ / ? * [ ]
  // Put `[` first in the character class to avoid escaping it.
  const cleaned = name.replace(/[[:\\/?*\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const truncated = cleaned.slice(0, 31);
  return truncated.length ? truncated : 'Sheet1';
}

function buildWorksheetXml(tab: TabularData): string {
  const rows: Array<Array<string | number | null | undefined>> = [tab.headers, ...tab.rows];

  let sheetData = '';
  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 1;
    const row = rows[r] ?? [];
    let cells = '';

    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === null || v === undefined) continue;

      const ref = `${colName(c)}${rowNum}`;
      if (typeof v === 'number' && Number.isFinite(v)) {
        cells += `<c r="${ref}"><v>${v}</v></c>`;
      } else {
        const text = xmlEscape(String(v));
        // inline string (no sharedStrings.xml needed)
        cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
      }
    }

    sheetData += `<row r="${rowNum}">${cells}</row>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>
    ${sheetData}
  </sheetData>
</worksheet>`;
}

function buildSummaryTabular(bundle: ExportBundle): TabularData {
  const warnings = bundle.warnings?.length ? bundle.warnings.join('\n') : '';
  const now = new Date().toISOString();

  return {
    headers: ['Field', 'Value'],
    rows: [
      ['Title', bundle.title],
      ['Generated (UTC)', now],
      ['Artifacts', String(bundle.artifacts.length)],
      ['Warnings', warnings],
    ],
  };
}

function getTableArtifacts(bundle: ExportBundle): Array<{ name: string; data: TabularData }> {
  return bundle.artifacts
    .filter((a): a is Extract<ExportArtifact, { type: 'table' }> => a.type === 'table')
    .map((a) => ({ name: a.name, data: a.data }));
}

export async function generateXlsxBlobV1(bundle: ExportBundle, options: XlsxOptions): Promise<Blob> {
  const sheets: Array<{ name: string; tabular: TabularData }> = [];

  if (options.includeSummary) {
    sheets.push({ name: 'Summary', tabular: buildSummaryTabular(bundle) });
  }

  if (options.includeRawData) {
    const tables = getTableArtifacts(bundle);
    if (tables.length === 1 && options.sheetName) {
      sheets.push({ name: options.sheetName, tabular: tables[0].data });
    } else {
      for (const t of tables) {
        sheets.push({ name: t.name, tabular: t.data });
      }
    }
  }

  if (!sheets.length) {
    // Always produce a workbook with at least one sheet
    sheets.push({ name: 'Summary', tabular: buildSummaryTabular(bundle) });
  }

  // Sanitize and de-duplicate sheet names
  const used = new Set<string>();
  const normSheets = sheets.map((s, idx) => {
    const base = sanitizeSheetName(s.name);
    let name = base;
    let n = 2;
    while (used.has(name)) {
      const suffix = ` ${n++}`;
      name = sanitizeSheetName((base + suffix).slice(0, 31));
    }
    used.add(name);
    return { ...s, name, idx: idx + 1 };
  });

  const contentTypesOverrides: string[] = [];
  const workbookRels: string[] = [];
  const workbookSheets: string[] = [];

  for (const s of normSheets) {
    contentTypesOverrides.push(
      `<Override PartName="/xl/worksheets/sheet${s.idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    );
    workbookRels.push(
      `<Relationship Id="rId${s.idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.idx}.xml"/>`
    );
    workbookSheets.push(
      `<sheet name="${xmlEscape(s.name)}" sheetId="${s.idx}" r:id="rId${s.idx}"/>`
    );
  }

  // Basic required files
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentTypesOverrides.join('\n  ')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${workbookSheets.join('\n    ')}
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels.join('\n  ')}
  <Relationship Id="rId${normSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Minimal styles (required by some consumers)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="1">
    <fill><patternFill patternType="none"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const zip = new ZipWriter();
  // ZipWriter API: addFile(path, data) and build()
  zip.addFile('[Content_Types].xml', contentTypes);
  zip.addFile('_rels/.rels', rootRels);
  zip.addFile('xl/workbook.xml', workbookXml);
  zip.addFile('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.addFile('xl/styles.xml', stylesXml);

  for (const s of normSheets) {
    zip.addFile(`xl/worksheets/sheet${s.idx}.xml`, buildWorksheetXml(s.tabular));
  }

  const bytes = zip.build();
  const safeBytes = new Uint8Array(bytes);

  return new Blob([safeBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
