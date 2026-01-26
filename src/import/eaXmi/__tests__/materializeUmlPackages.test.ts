import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import type { IRModel, IRRelationship } from '../../framework/ir';

import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';
import { parseEaXmiClassifiersToElements } from '../parseElements';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';
import { materializeUmlPackagesFromEaXmi } from '../materializeUmlPackages';
import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('EA XMI package EAID_* alias handling', () => {
  test('materializes uml.package elements and resolves diagram nodes referencing package2 (EAID_*)', () => {
    const xml = readFixture('diagrams-with-package-eaid.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements } = parseEaXmiClassifiersToElements(doc, report);

    const { views: v0 } = parseEaDiagramCatalog(doc, report);
    const { views } = parseEaDiagramObjects(doc, v0, report);

    // Simulate a relationship that references the package using EAID_*.
    const relationships: IRRelationship[] = [
      {
        id: 'R1',
        type: 'uml.dependency',
        sourceId: 'EAID_ELEM1',
        targetId: 'EAID_P1'
      }
    ];

    const mat = materializeUmlPackagesFromEaXmi(doc, folders, elements, relationships, views, report);

    // We should have created a package element with the XMI id (EAPK_*).
    const pkg = mat.elements.find((e) => e.id === 'EAPK_P1');
    expect(pkg).toBeDefined();
    expect(pkg!.type).toBe('uml.package');
    expect(pkg!.externalIds?.some((x) => x.id === 'EAID_P1')).toBe(true);

    // Relationship endpoint should be rewritten from EAID_* -> EAPK_*.
    expect(mat.relationships[0]!.targetId).toBe('EAPK_P1');

    const ir: IRModel = {
      folders,
      elements: mat.elements,
      relationships: mat.relationships,
      views,
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    const normalized = normalizeEaXmiImportIR(ir, { report, source: 'ea-xmi-uml' })!;
    const d1 = (normalized.views ?? [])[0]!;
    const nPkg = d1.nodes.find((n) => n.id === 'DO_PKG')!;
    const nCls = d1.nodes.find((n) => n.id === 'DO_CLS')!;

    expect(nPkg.elementId).toBe('EAPK_P1');
    expect(nCls.elementId).toBe('EAID_ELEM1');
  });
});
