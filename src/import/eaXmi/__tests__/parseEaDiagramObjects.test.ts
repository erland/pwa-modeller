import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('eaXmi diagram object parsing (Step B1b)', () => {
  test('parses diagram objects into view nodes with bounds and unresolved refs', () => {
    const xml = readFixture('diagrams-with-objects.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    expect(viewsB1a).toHaveLength(2);

    const { views } = parseEaDiagramObjects(doc, viewsB1a, report);
    expect(views).toHaveLength(2);

    const byName = new Map(views.map((v) => [v.name, v]));
    const useCase = byName.get('Use Case Overview');
    const classDia = byName.get('Core Classes');

    expect(useCase?.nodes).toHaveLength(3);
    expect(classDia?.nodes).toHaveLength(1);

    const n1 = useCase!.nodes.find((n) => n.id === 'DO1')!;
    expect(n1.elementId).toBeUndefined();
    expect(n1.kind).toBe('element');
    expect(n1.bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect((n1.meta as any)?.refRaw?.subject).toBe('{ELEM1-GUID}');

    const n2 = useCase!.nodes.find((n) => n.id === 'DO2')!;
    expect(n2.bounds).toEqual({ x: 150, y: 40, width: 100, height: 50 });
    expect((n2.meta as any)?.refRaw?.subject).toBe('{ELEM2-GUID}');

    const n3 = useCase!.nodes.find((n) => n.id === 'DO3')!;
    expect(n3.kind).toBe('note');
    expect(n3.bounds).toEqual({ x: 300, y: 100, width: 80, height: 40 });

    const n4 = classDia!.nodes.find((n) => n.id === 'DO4')!;
    // bounds string interpreted as l,t,r,b
    expect(n4.bounds).toEqual({ x: 20, y: 30, width: 100, height: 100 });
    expect((n4.meta as any)?.refRaw?.subject).toBe('EAID_123');

    // Happy-path fixture should not yield warnings.
    expect(report.warnings).toEqual([]);
  });
});
