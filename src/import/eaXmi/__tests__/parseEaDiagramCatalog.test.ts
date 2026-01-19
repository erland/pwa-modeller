import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('eaXmi diagram catalog parsing (Step B1a)', () => {
  test('discovers diagrams in xmi:Extension and produces empty IR views', () => {
    const xml = readFixture('diagrams-catalog-only.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { views } = parseEaDiagramCatalog(doc, report);
    expect(views).toHaveLength(2);

    const byName = new Map(views.map((v) => [v.name, v]));
    expect(byName.get('Use Case Overview')?.viewpoint).toBe('UseCase');
    expect(byName.get('Core Classes')?.viewpoint).toBe('Class');

    // Prefer EA GUID for stable ids when present.
    expect(byName.get('Use Case Overview')?.id).toBe('{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}');
    expect(byName.get('Core Classes')?.id).toBe('{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}');

    // Empty nodes/connections in B1a.
    for (const v of views) {
      expect(v.nodes).toEqual([]);
      expect(v.connections).toEqual([]);
      expect(v.meta?.sourceSystem).toBe('sparx-ea');
      expect(v.folderId).toBe('pkg1');
    }

    // No warnings expected for this happy-path fixture.
    expect(report.warnings).toEqual([]);
  });

  test('returns empty views with a warning when EA extension is missing', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="m1" name="NoExt" />
      </xmi:XMI>
    `;
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { views } = parseEaDiagramCatalog(doc, report);
    expect(views).toEqual([]);
    expect(report.warnings.join('\n')).toMatch(/No Enterprise Architect <xmi:Extension>/i);
  });
});
