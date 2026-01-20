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

describe('eaXmi view node resolution (Step 3): element records are not misclassified as shapes', () => {
  test('resolves <diagram><elements><element …/> records to model elements', () => {
    const xml = readFixture('diagrams-with-element-records.xmi');
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
    const v = (normalized.views ?? []).find((x) => x.name === 'Element Records')!;
    expect(v).toBeDefined();

    const n = v.nodes.find((x) => x.id === 'DO5')!;
    expect(n).toBeDefined();
    expect(n.kind).toBe('element');
    expect(n.elementId).toBe('EAID_123');
  });
});
