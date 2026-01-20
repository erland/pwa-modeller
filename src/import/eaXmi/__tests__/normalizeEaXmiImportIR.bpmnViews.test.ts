import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import type { IRModel } from '../../framework/ir';

import { parseEaXmiBpmnProfileElementsToElements } from '../parseElements';
import { parseEaXmiBpmnProfileRelationships } from '../parseRelationships';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';
import { parseEaDiagramConnections } from '../parseEaDiagramConnections';
import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi BPMN diagram import (Step 5C)', () => {
  test('imports EA diagram objects + links as IR views, resolves them to BPMN elements/relationships, and applies pool/lane containment', () => {
    const xml = readFixture('ea-xmi-bpmn-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { elements } = parseEaXmiBpmnProfileElementsToElements(doc, report);
    const { relationships } = parseEaXmiBpmnProfileRelationships(doc, report);

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    const { views: viewsWithNodes } = parseEaDiagramObjects(doc, viewsB1a, report);
    const { views } = parseEaDiagramConnections(doc, viewsWithNodes, report);

    const ir: IRModel = {
      folders: [],
      elements,
      relationships,
      views,
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    const normalized = normalizeEaXmiImportIR(ir, { report, source: 'ea-xmi-uml' })!;

    const v = (normalized.views ?? []).find((x) => x.name === 'BPMN view');
    expect(v).toBeDefined();

    const pool = v!.nodes.find((n) => n.id === 'BDO1')!;
    const lane = v!.nodes.find((n) => n.id === 'BDO2')!;
    const start = v!.nodes.find((n) => n.id === 'BDO3')!;
    const task = v!.nodes.find((n) => n.id === 'BDO4')!;
    const end = v!.nodes.find((n) => n.id === 'BDO5')!;

    expect(pool.elementId).toBe('BP1');
    expect(lane.elementId).toBe('BL1');
    expect(start.elementId).toBe('BS1');
    expect(task.elementId).toBe('BT1');
    expect(end.elementId).toBe('BE1');

    // Containment
    expect(lane.parentNodeId).toBe(pool.id);
    expect(start.parentNodeId).toBe(lane.id);
    expect(task.parentNodeId).toBe(lane.id);
    expect(end.parentNodeId).toBe(lane.id);

    // Connections resolve to BPMN relationships
    const c1 = v!.connections.find((c) => c.id === 'BDL1')!;
    const c2 = v!.connections.find((c) => c.id === 'BDL2')!;

    expect(c1.relationshipId).toBe('BF1');
    expect(c1.sourceNodeId).toBe('BDO3');
    expect(c1.targetNodeId).toBe('BDO4');
    expect(c1.sourceElementId).toBe('BS1');
    expect(c1.targetElementId).toBe('BT1');

    expect(c2.relationshipId).toBe('BF2');
    expect(c2.sourceNodeId).toBe('BDO4');
    expect(c2.targetNodeId).toBe('BDO5');
    expect(c2.sourceElementId).toBe('BT1');
    expect(c2.targetElementId).toBe('BE1');

    // This fixture is intentionally self-contained; should not yield warnings.
    expect(report.warnings).toEqual([]);
  });
});
