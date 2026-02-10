import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import type { IRModel } from '../../framework/ir';

import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';
import { parseEaXmiArchiMateProfileElementsToElements } from '../parseElements';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';

import { buildEaExtensionElementOwnerIndex } from '../parser/parseElements.common';
import { applyImportIR } from '../../apply/applyImportIR';
import { modelStore } from '../../../store';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

function findInternalElementIdByXmiId(xmiId: string): string {
  const model = modelStore.getState().model;
  if (!model) throw new Error('Expected modelStore to contain a model');
  for (const el of Object.values(model.elements)) {
    const hit = (el.externalIds ?? []).some((x) => x.system === 'xmi' && x.id === xmiId);
    if (hit) return el.id;
  }
  throw new Error(`Could not find internal element for xmi id "${xmiId}"`);
}

describe('EA XMI: semantic ownership mapping (containment)', () => {
  test('maps element ownership from vendor extension <element><model owner="..."/></element>', () => {
    const xml = readFixture('ea-xmi-containment-owner-minimal.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements: archimateElements } = parseEaXmiArchiMateProfileElementsToElements(doc, report);

    const ownerByIdRef = buildEaExtensionElementOwnerIndex(doc);
    expect(ownerByIdRef.get('AChild')).toBe('AParent');

    const elements = archimateElements.map((e) => {
      const owner = ownerByIdRef.get(e.id);
      return owner ? { ...e, parentElementId: owner } : e;
    });

    const ir: IRModel = {
      folders,
      elements,
      relationships: [],
      views: [],
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    modelStore.reset();
    applyImportIR(ir, report, { sourceSystem: 'ea-xmi-uml' });

    const parentInternal = findInternalElementIdByXmiId('AParent');
    const childInternal = findInternalElementIdByXmiId('AChild');

    const model = modelStore.getState().model!;
    expect(model.elements[childInternal]!.parentElementId).toBe(parentInternal);
  });

  test('maps diagram parent to view.ownerRef when <diagram><model parent="..."/></diagram> is present', () => {
    const xml = readFixture('ea-xmi-containment-owner-minimal.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements: archimateElements } = parseEaXmiArchiMateProfileElementsToElements(doc, report);
    const ownerByIdRef = buildEaExtensionElementOwnerIndex(doc);
    const elements = archimateElements.map((e) => {
      const owner = ownerByIdRef.get(e.id);
      return owner ? { ...e, parentElementId: owner } : e;
    });

    const { views } = parseEaDiagramCatalog(doc, report);
    const v = views.find((x) => x.name === 'Owned diagram');
    expect(v).toBeTruthy();
    expect((v as any).meta?.owningElementId).toBe('AParent');

    const ir: IRModel = {
      folders,
      elements,
      relationships: [],
      views,
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    modelStore.reset();
    applyImportIR(ir, report, { sourceSystem: 'ea-xmi-uml' });

    const parentInternal = findInternalElementIdByXmiId('AParent');
    const model = modelStore.getState().model!;
    const importedView = Object.values(model.views).find((x) => x.name === 'Owned diagram');
    expect(importedView).toBeTruthy();
    expect(importedView!.ownerRef?.id).toBe(parentInternal);
  });
});
