import * as fs from 'node:fs';
import * as path from 'node:path';

import { detectBpmn2FromText } from '../../../import/bpmn2/detectBpmn2';
import { parseBpmn2Xml } from '../../../import/bpmn2/parseBpmn2Xml';
import { normalizeBpmn2ImportIR } from '../../../import/bpmn2/normalizeBpmn2ImportIR';
import { createImportReport } from '../../../import/importReport';

function readRoundtripFixture(name: string): string {
  const p = path.resolve(__dirname, '../../fixtures/bpmn2/roundtrip', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('BPMN2 round-trip fixture: importer smoke test', () => {
  it('parses the Tullverket example BPMN without throwing and yields a non-trivial IR', () => {
    const xml = readRoundtripFixture('tullverket-importcontrol.bpmn');

    expect(detectBpmn2FromText(xml.slice(0, 600))).toBe(true);

    const res = parseBpmn2Xml(xml);
    expect(res.importIR.meta?.format).toBe('bpmn2');

    const report = createImportReport('bpmn2');
    const normalized = normalizeBpmn2ImportIR(res.importIR, { report, source: 'bpmn2' });

    // The fixture is intentionally rich: pools, lanes, events, gateways, data, DI.
    expect(normalized.elements.length).toBeGreaterThan(30);
    expect(normalized.relationships.length).toBeGreaterThan(20);
    expect(normalized.views?.length ?? 0).toBeGreaterThan(0);

    // Should not produce a fatal error; warnings are fine.
    expect(Array.isArray(report.warnings)).toBe(true);
  });
});
