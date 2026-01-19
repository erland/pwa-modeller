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
import { parseEaDiagramConnections } from '../parseEaDiagramConnections';
import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('eaXmi view connection resolution (Step B2b)', () => {
  test('resolves diagram link relationship refs and keeps waypoints', () => {
    const xml = readFixture('diagrams-with-links.xmi');
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements } = parseEaXmiClassifiersToElements(doc, report);
    const { relationships } = parseEaXmiRelationships(doc, report);

    const { views: viewsB1a } = parseEaDiagramCatalog(doc, report);
    const { views: viewsWithNodes } = parseEaDiagramObjects(doc, viewsB1a, report);
    const { views } = parseEaDiagramConnections(doc, viewsWithNodes, report);

    const ir: IRModel = {
      folders,
      elements,
      relationships,
      views,
      meta: { format: 'ea-xmi-uml', tool: 'Sparx Enterprise Architect', sourceSystem: 'sparx-ea' }
    };

    const normalized = normalizeEaXmiImportIR(ir, { report, source: 'ea-xmi-uml' })!;
    const v = (normalized.views ?? [])[0]!;

    // Nodes resolved first
    const do1 = v.nodes.find((n) => n.id === 'DO1')!;
    const do2 = v.nodes.find((n) => n.id === 'DO2')!;
    expect(do1.elementId).toBe('EAID_ELEM1');
    expect(do2.elementId).toBe('EAID_ELEM2');

    // Connection resolved by relationship ea_guid
    expect(v.connections).toHaveLength(1);
    const c = v.connections[0]!;
    expect(c.relationshipId).toBe('EAID_REL1');

    // Endpoints recorded (helpful for future quality work)
    expect(c.sourceElementId).toBe('EAID_ELEM1');
    expect(c.targetElementId).toBe('EAID_ELEM2');

    // Waypoints preserved
    expect(c.points).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 40 },
      { x: 200, y: 40 }
    ]);

    expect(report.warnings).toEqual([]);
  });
});
