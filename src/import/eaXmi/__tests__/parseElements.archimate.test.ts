import * as fs from 'fs';
import * as path from 'path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiArchiMateProfileElementsToElements } from '../parseElements';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi ArchiMate element parsing (Step 2)', () => {
  test('parses ArchiMate profile element tags into IR elements and skips ArchiMate relationship tags', () => {
    const xml = readFixture('ea-xmi-archimate-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { elements } = parseEaXmiArchiMateProfileElementsToElements(doc, report);

    // Fixture contains two ArchiMate elements (A1, A2) and one relationship (R1).
    expect(elements).toHaveLength(2);

    const byId = new Map(elements.map((e) => [e.id, e]));

    expect(byId.get('A1')?.type).toBe('BusinessProcess');
    expect(byId.get('A1')?.name).toBe('Order process');

    expect(byId.get('A2')?.type).toBe('BusinessActor');
    expect(byId.get('A2')?.name).toBe('Customer');

    // No warnings expected for the fixture.
    expect(report.warnings).toEqual([]);
  });
});
