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

  test('parses connector-as-<element> links and only uses Path waypoints (no junk from geometry)', () => {
    const xml = readFixture('diagrams-with-element-links.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    const { views: viewsWithNodes } = parseEaDiagramObjects(doc, viewsB1a, report);
    const { views } = parseEaDiagramConnections(doc, viewsWithNodes, report);

    expect(views).toHaveLength(1);
    const v = views[0]!;
    expect(v.name).toBe('Element Link Diagram');

    // Two connections (both encoded as <element … subject="EAID_REL*" style="…EOID…SOID…" />)
    expect(v.connections).toHaveLength(2);

    const c1 = v.connections.find((c) => c.id === 'EAID_REL1')!;
    expect(c1.points).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 40 },
      { x: 200, y: 40 }
    ]);
    const rr1 = (c1.meta as any)?.refRaw;
    expect(rr1?.connector).toBe('EAID_REL1');
    expect(rr1?.source).toBe('DO1');
    expect(rr1?.target).toBe('DO2');

    const c2 = v.connections.find((c) => c.id === 'EAID_REL2')!;
    // Empty Path should not yield nonsense waypoints.
    expect(c2.points).toBeUndefined();
    const rr2 = (c2.meta as any)?.refRaw;
    expect(rr2?.connector).toBe('EAID_REL2');

    expect(report.warnings).toEqual([]);
  });
});
