import { addWarning, createImportReport } from '../importReport';
import { readBlobAsArrayBuffer } from '../framework/blobReaders';
import { decodeXmlBytes } from '../framework/xmlDecoding';
import type { ImportResult, Importer } from '../framework/importer';
import type { IRModel } from '../framework/ir';

import { detectBpmn2FromBytes, detectBpmn2FromText } from './detectBpmn2';
import { parseBpmn2Xml } from './parseBpmn2Xml';

export const bpmn2Importer: Importer<IRModel> = {
  id: 'bpmn2',
  format: 'bpmn2',
  displayName: 'BPMN 2.0 XML',
  // Slightly above MEFF to ensure BPMN 2.0 XML is preferred when sniff matches.
  priority: 110,
  // Extension fallback: keep this narrow to avoid accidentally claiming generic XML.
  extensions: ['bpmn'],
  sniff(ctx) {
    // If the file is explicitly a .bpmn, assume it is intended to be BPMN 2.0 (sniffText might be empty).
    if (ctx.extension === 'bpmn') return true;
    if (detectBpmn2FromText(ctx.sniffText)) return true;
    // Some environments (notably certain test setups) may not provide TextDecoder,
    // leaving sniffText empty. Fall back to a light byte-based sniff.
    return detectBpmn2FromBytes(ctx.sniffBytes);
  },
  async import(file, _ctx): Promise<ImportResult<IRModel>> {
    // Intentionally unused for now (kept for interface parity / future use).
    void _ctx;
    const buf = await readBlobAsArrayBuffer(file);
    const { text } = decodeXmlBytes(new Uint8Array(buf));

    // Parser is filename-agnostic; keep signature simple and avoid leaking UI concerns into parsing.
    const parsed = parseBpmn2Xml(text);
    const report = createImportReport('bpmn2');
    report.source = 'bpmn2';

    for (const w of parsed.warnings) addWarning(report, w, { code: 'bpmn2-parse' });

    // Helpful hint if semantics parsing produced nothing.
    if (parsed.importIR.elements.length === 0 && parsed.importIR.relationships.length === 0) {
      addWarning(
        report,
        'BPMN2: Parsed 0 elements and 0 relationships. Verify that the file is a BPMN 2.0 XML export (with <definitions>).',
        { code: 'bpmn2-empty' }
      );
    }

    return {
      format: 'bpmn2',
      importerId: 'bpmn2',
      ir: parsed.importIR,
      report
    };
  }
};
