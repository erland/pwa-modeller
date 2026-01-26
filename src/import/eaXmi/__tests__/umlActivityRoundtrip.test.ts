import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import type { IRModel } from '../../framework/ir';

import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';
import { parseEaXmiClassifiersToElements } from '../parseElements';
import { parseEaXmiRelationships } from '../parseRelationships';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';
import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('eaXmi UML Activity import roundtrip (Step 6)', () => {
  test('imports Activity nodes/flows, applies EA xmi:Extension notes, and resolves diagram objects', () => {
    const xml = readFixture('uml-activity-diagram.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements } = parseEaXmiClassifiersToElements(doc, report);
    const { relationships } = parseEaXmiRelationships(doc, report);

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    const { views } = parseEaDiagramObjects(doc, viewsB1a, report);

    const ir: IRModel = {
      folders,
      elements,
      relationships,
      views,
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    const normalized = normalizeEaXmiImportIR(ir, { report, source: 'ea-xmi-uml' })!;

    const elById = new Map((normalized.elements ?? []).map((e) => [e.id, e]));
    const relById = new Map((normalized.relationships ?? []).map((r) => [r.id, r]));
    const viewByName = new Map((normalized.views ?? []).map((v) => [v.name, v]));

    // Elements created with correct types.
    expect(elById.get('A1')?.type).toBe('uml.activity');
    expect(elById.get('N0')?.type).toBe('uml.initialNode');
    expect(elById.get('N1')?.type).toBe('uml.action');
    expect(elById.get('N2')?.type).toBe('uml.decisionNode');
    expect(elById.get('N3')?.type).toBe('uml.mergeNode');
    expect(elById.get('N4')?.type).toBe('uml.activityFinalNode');

    // Documentation populated via EA vendor extension element records.
    expect(elById.get('N1')?.documentation).toBe('Action doc from EA extension');
    expect(elById.get('N2')?.documentation).toBe('Decision doc behövs');

    // Relationships created and typed.
    expect(relById.get('CF1')?.type).toBe('uml.controlFlow');
    expect(relById.get('CF1')?.sourceId).toBe('N0');
    expect(relById.get('CF1')?.targetId).toBe('N1');
    expect(relById.get('CF1')?.documentation).toBe('Go');

    expect(relById.get('CF2')?.type).toBe('uml.controlFlow');
    expect((relById.get('CF2') as any)?.attrs?.guard).toBe('x > 0');

    // View nodes resolve to elements.
    const activityView = viewByName.get('Activity Overview')!;
    const byNodeId = new Map(activityView.nodes.map((n) => [n.id, n]));
    expect(byNodeId.get('DO_A')?.elementId).toBe('A1');
    expect(byNodeId.get('DO0')?.elementId).toBe('N0');
    expect(byNodeId.get('DO1')?.elementId).toBe('N1');
    expect(byNodeId.get('DO2')?.elementId).toBe('N2');
    expect(byNodeId.get('DO3')?.elementId).toBe('N3');
    expect(byNodeId.get('DO4')?.elementId).toBe('N4');

    // Step 3: Activity containment normalization is derived from the view.
    const a1: any = elById.get('A1');
    const n1: any = elById.get('N1');
    const n2: any = elById.get('N2');
    expect(n1.attrs?.activityId).toBe('A1');
    expect(n2.attrs?.activityId).toBe('A1');
    expect(a1.attrs?.ownedNodeRefs).toEqual(expect.arrayContaining(['N0', 'N1', 'N2', 'N3', 'N4']));

    // Fixture should be clean.
    expect(report.warnings).toEqual([]);
  });
});
