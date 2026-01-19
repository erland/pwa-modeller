import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import type { IRModel } from '../../framework/ir';

import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';
import { parseEaXmiClassifiersToElements } from '../parseElements';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';
import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('eaXmi view node resolution (Step B2)', () => {
  test('resolves diagram object refs to imported elements and finalizes views', () => {
    const xml = readFixture('diagrams-with-objects.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements } = parseEaXmiClassifiersToElements(doc, report);

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    const { views } = parseEaDiagramObjects(doc, viewsB1a, report);

    const ir: IRModel = {
      folders,
      elements,
      relationships: [],
      views,
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    const normalized = normalizeEaXmiImportIR(ir, { report, source: 'ea-xmi-uml' })!;
    expect(normalized.views).toBeDefined();

    const byName = new Map((normalized.views ?? []).map((v) => [v.name, v]));
    const useCase = byName.get('Use Case Overview')!;
    const classDia = byName.get('Core Classes')!;

    const n1 = useCase.nodes.find((n) => n.id === 'DO1')!;
    const n2 = useCase.nodes.find((n) => n.id === 'DO2')!;
    const n3 = useCase.nodes.find((n) => n.id === 'DO3')!;
    const n4 = classDia.nodes.find((n) => n.id === 'DO4')!;

    // DO1/DO2 resolved by ea_guid -> element IR id (xmi:id)
    expect(n1.elementId).toBe('EAID_ELEM1');
    expect(n2.elementId).toBe('EAID_ELEM2');

    // Note-like nodes are preserved as view-local objects.
    expect(n3.kind).toBe('note');
    expect(n3.elementId).toBeUndefined();

    // DO4 resolved by xmi:id-like EAID_…
    expect(n4.elementId).toBe('EAID_123');

    // Fixture is complete; should not yield warnings.
    expect(report.warnings).toEqual([]);
  });
});
