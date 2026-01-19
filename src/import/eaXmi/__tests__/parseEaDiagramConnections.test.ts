import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';
import { parseEaDiagramConnections } from '../parseEaDiagramConnections';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('eaXmi diagram connection parsing (Step B2b)', () => {
  test('parses diagram links into view connections with points and unresolved refs', () => {
    const xml = readFixture('diagrams-with-links.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    const { views: viewsWithNodes } = parseEaDiagramObjects(doc, viewsB1a, report);
    const { views } = parseEaDiagramConnections(doc, viewsWithNodes, report);

    expect(views).toHaveLength(1);

    const v = views[0]!;
    expect(v.name).toBe('Link Diagram');
    expect(v.connections).toHaveLength(1);

    const c = v.connections[0]!;
    expect(c.id).toBe('DL1');
    expect(c.points).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 40 },
      { x: 200, y: 40 }
    ]);

    const refRaw = (c.meta as any)?.refRaw;
    expect(refRaw?.connector).toBe('{REL1-GUID}');
    expect(refRaw?.source).toBe('DO1');
    expect(refRaw?.target).toBe('DO2');

    expect(report.warnings).toEqual([]);
  });
});
