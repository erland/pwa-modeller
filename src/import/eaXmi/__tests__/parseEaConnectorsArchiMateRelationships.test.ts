import * as fs from 'fs';
import * as path from 'path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiArchiMateConnectorRelationships } from '../parseEaConnectorsArchiMateRelationships';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi ArchiMate connector relationship parsing (Step 1)', () => {
  test('parses EA <connectors> stereotypes into IR relationships', () => {
    const xml = readFixture('ea-xmi-archimate-connectors-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { relationships } = parseEaXmiArchiMateConnectorRelationships(doc, report);

    expect(relationships).toHaveLength(1);
    const r = relationships[0]!;

    expect(r.id).toBe('EAID_R1');
    expect(r.type).toBe('Serving');
    expect(r.sourceId).toBe('EAID_A1');
    expect(r.targetId).toBe('EAID_A2');
    expect((r.meta as any)?.eaConnector).toBe(true);
    expect(report.warnings).toEqual([]);
  });
});
