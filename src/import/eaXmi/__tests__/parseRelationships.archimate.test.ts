import * as fs from 'fs';
import * as path from 'path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiArchiMateProfileRelationships } from '../parseRelationships';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi ArchiMate relationship parsing (Step 3)', () => {
  test('parses ArchiMate profile relationship tags into IR relationships', () => {
    const xml = readFixture('ea-xmi-archimate-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { relationships } = parseEaXmiArchiMateProfileRelationships(doc, report);

    expect(relationships).toHaveLength(1);
    const r = relationships[0]!;

    expect(r.id).toBe('R1');
    expect(r.type).toBe('Flow');
    expect(r.sourceId).toBe('A2');
    expect(r.targetId).toBe('A1');

    expect(r.taggedValues?.some((tv) => tv.key === 'profileTag' && tv.value.includes('ArchiMate'))).toBe(true);
    expect((r.meta as any)?.archimateProfileTag).toBe('ArchiMate3:ArchiMate_Flow');

    // Happy path for fixture: no warnings expected.
    expect(report.warnings).toEqual([]);
  });
});
