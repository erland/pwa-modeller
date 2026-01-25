import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';

function escapeCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // RFC4180-ish: quote if contains comma, quote, CR/LF
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportRelationshipMatrixCsv(modelName: string, result: RelationshipMatrixResult): void {
  const { rows, cols, cells, rowTotals, colTotals, grandTotal } = result;

  const header = ['Row \\ Col', ...cols.map((c) => c.label), 'Total'];
  const lines: string[] = [];
  lines.push(header.map(escapeCsvValue).join(','));

  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const rowVals: unknown[] = [r.label];
    for (let ci = 0; ci < cols.length; ci++) {
      rowVals.push(cells[ri][ci].count || '');
    }
    rowVals.push(rowTotals[ri] ?? 0);
    lines.push(rowVals.map(escapeCsvValue).join(','));
  }

  const totalRow: unknown[] = ['Total', ...cols.map((_, ci) => colTotals[ci] ?? 0), grandTotal];
  lines.push(totalRow.map(escapeCsvValue).join(','));

  const csv = lines.join('\n');
  const baseName = `${modelName}-relationship-matrix`;
  downloadTextFile(sanitizeFileNameWithExtension(baseName, 'csv'), csv, 'text/csv');
}

export function exportRelationshipMatrixMissingLinksCsv(
  modelName: string,
  result: RelationshipMatrixResult,
  opts?: { excludeSelf?: boolean }
): void {
  const excludeSelf = opts?.excludeSelf ?? true;
  const { rows, cols, cells } = result;

  const lines: string[] = [];
  lines.push(['rowId', 'rowName', 'colId', 'colName'].map(escapeCsvValue).join(','));

  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci];
      if (excludeSelf && r.id === c.id) continue;
      const cell = cells[ri][ci];
      if (cell.count !== 0) continue;
      lines.push([r.id, r.label, c.id, c.label].map(escapeCsvValue).join(','));
    }
  }

  const csv = lines.join('\n');
  const baseName = `${modelName}-relationship-matrix-missing-links`;
  downloadTextFile(sanitizeFileNameWithExtension(baseName, 'csv'), csv, 'text/csv');
}
