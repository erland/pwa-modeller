import * as fs from 'fs';
import * as path from 'path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiBpmnProfileElementsToElements } from '../parseElements';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi BPMN element parsing (Step 5A)', () => {
  test('parses BPMN profile element tags into IR elements and skips BPMN relationship tags', () => {
    const xml = readFixture('ea-xmi-bpmn-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { elements } = parseEaXmiBpmnProfileElementsToElements(doc, report);

    // Fixture contains 5 BPMN elements and one relationship tag (SequenceFlow) that should be skipped.
    expect(elements).toHaveLength(5);

    const byId = new Map(elements.map((e) => [e.id, e]));

    expect(byId.get('BP1')?.type).toBe('bpmn.pool');
    expect(byId.get('BP1')?.name).toBe('Sales Pool');

    expect(byId.get('BL1')?.type).toBe('bpmn.lane');
    expect(byId.get('BL1')?.name).toBe('Sales Lane');

    expect(byId.get('BS1')?.type).toBe('bpmn.startEvent');
    expect(byId.get('BS1')?.name).toBe('Start');

    expect(byId.get('BT1')?.type).toBe('bpmn.task');
    expect(byId.get('BT1')?.name).toBe('Do work');

    expect(byId.get('BE1')?.type).toBe('bpmn.endEvent');
    expect(byId.get('BE1')?.name).toBe('End');

    // No warnings expected for the fixture.
    expect(report.warnings).toEqual([]);
  });
});
