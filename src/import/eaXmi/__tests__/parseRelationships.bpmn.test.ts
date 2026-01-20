import * as fs from 'fs';
import * as path from 'path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiBpmnProfileRelationships } from '../parseRelationships';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi BPMN relationship parsing (Step 5B)', () => {
  test('parses BPMN profile relationship tags into IR relationships with endpoints', () => {
    const xml = readFixture('ea-xmi-bpmn-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { relationships } = parseEaXmiBpmnProfileRelationships(doc, report);

    // Fixture contains two sequence flows.
    expect(relationships).toHaveLength(2);

    const byId = new Map(relationships.map((r) => [r.id, r] as const));

    const r1 = byId.get('BF1');
    expect(r1).toBeTruthy();
    expect(r1!.type).toBe('bpmn.sequenceFlow');
    expect(r1!.sourceId).toBe('BS1');
    expect(r1!.targetId).toBe('BT1');

    const r2 = byId.get('BF2');
    expect(r2).toBeTruthy();
    expect(r2!.type).toBe('bpmn.sequenceFlow');
    expect(r2!.sourceId).toBe('BT1');
    expect(r2!.targetId).toBe('BE1');

    expect(r1!.taggedValues?.some((tv) => tv.key === 'profileTag' && tv.value.includes('BPMN'))).toBe(true);
    expect((r1!.meta as any)?.bpmnProfileTag).toBe('BPMN2:SequenceFlow');

    // Happy path for fixture: no warnings expected.
    expect(report.warnings).toEqual([]);
  });
});
