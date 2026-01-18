import * as fs from 'node:fs';
import * as path from 'node:path';

import { detectBpmn2FromText } from '../../../import/bpmn2/detectBpmn2';
import { parseBpmn2Xml } from '../../../import/bpmn2/parseBpmn2Xml';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../fixtures/bpmn2/ea', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('BPMN2 XML parsing (skeleton)', () => {
  it('sniffs BPMN2 and reaches <definitions> without throwing', () => {
    const xml = readFixture('minimal-export.bpmn');

    // The sniffer is designed to run on a prefix; emulate that.
    expect(detectBpmn2FromText(xml.slice(0, 400))).toBe(true);

    const res = parseBpmn2Xml(xml);
    expect(res.importIR.meta?.format).toBe('bpmn2');

    // Step 1: importer skeleton returns an empty but well-formed IR.
    expect(Array.isArray(res.importIR.folders)).toBe(true);
    expect(Array.isArray(res.importIR.elements)).toBe(true);
    expect(Array.isArray(res.importIR.relationships)).toBe(true);
    expect(Array.isArray(res.importIR.views)).toBe(true);

    expect(Array.isArray(res.warnings)).toBe(true);
  });
});
