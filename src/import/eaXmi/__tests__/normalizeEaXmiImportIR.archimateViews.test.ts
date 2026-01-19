import * as fs from 'node:fs';
import * as path from 'node:path';

import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import type { IRModel } from '../../framework/ir';

import { parseEaXmiArchiMateProfileElementsToElements } from '../parseElements';
import { parseEaXmiArchiMateProfileRelationships } from '../parseRelationships';
import { parseEaDiagramCatalog } from '../parseEaDiagramCatalog';
import { parseEaDiagramObjects } from '../parseEaDiagramObjects';
import { parseEaDiagramConnections } from '../parseEaDiagramConnections';
import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('eaXmi ArchiMate diagram import (Step 4)', () => {
  test('imports EA diagram objects + links as IR views and resolves them to ArchiMate elements/relationships', () => {
    const xml = readFixture('ea-xmi-archimate-minimal.xml');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { elements } = parseEaXmiArchiMateProfileElementsToElements(doc, report);
    const { relationships } = parseEaXmiArchiMateProfileRelationships(doc, report);

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

    const v = (normalized.views ?? []).find((x) => x.name === 'Business view');
    expect(v).toBeDefined();

    const n1 = v!.nodes.find((n) => n.id === 'DO1')!;
    const n2 = v!.nodes.find((n) => n.id === 'DO2')!;
    expect(n1.elementId).toBe('A1');
    expect(n2.elementId).toBe('A2');

    const c1 = v!.connections.find((c) => c.id === 'DL1')!;
    expect(c1.relationshipId).toBe('R1');
    expect(c1.sourceNodeId).toBe('DO2');
    expect(c1.targetNodeId).toBe('DO1');
    expect(c1.sourceElementId).toBe('A2');
    expect(c1.targetElementId).toBe('A1');

    // This fixture is intentionally self-contained; should not yield warnings.
    expect(report.warnings).toEqual([]);
  });
});
