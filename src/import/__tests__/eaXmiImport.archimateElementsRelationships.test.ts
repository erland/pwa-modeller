import * as fs from 'node:fs';
import * as path from 'node:path';

import { importModel } from '../framework/importModel';
import { modelStore } from '../../store';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

const ARCHIMATE_REL_TYPES_LIST: string[] = [
  'Association',
  'Serving',
  'Realization',
  'Flow',
  'Composition',
  'Aggregation',
  'Assignment',
  'Access',
  'Influence',
  'Triggering',
  'Specialization'
];

const ARCHIMATE_REL_TYPES = new Set<string>(ARCHIMATE_REL_TYPES_LIST);

describe('EA XMI ArchiMate import (ArchimateElementsRelationships.xml)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('imports many pure ArchiMate relationships and populated views', async () => {
    const xml = readFixture('ArchimateElementsRelationships.xml');
    const file = new File([xml], 'ArchimateElementsRelationships.xml', { type: 'application/xml' });

    const res = await importModel(file);

    // Sniff still uses the EA XMI UML importer, but the content is ArchiMate.
    expect(res.importerId).toBe('ea-xmi-uml');
    expect(res.format).toBe('ea-xmi-uml');

    // Elements
    expect(res.ir.elements.length).toBeGreaterThanOrEqual(35);
    const elementTypes = new Set(res.ir.elements.map((e) => e.type));
    expect(elementTypes.has('DataObject')).toBe(true);
    expect(elementTypes.has('ApplicationComponent')).toBe(true);
    expect(elementTypes.has('BusinessActor')).toBe(true);
    expect(elementTypes.has('Device')).toBe(true);

    // Relationships should be imported as ArchiMate relationship types (no UML leakage).
    expect(res.ir.relationships.length).toBeGreaterThanOrEqual(40);
    for (const r of res.ir.relationships) {
      expect(r.type.startsWith('uml.')).toBe(false);
      expect(ARCHIMATE_REL_TYPES.has(r.type)).toBe(true);
      expect(typeof r.sourceId).toBe('string');
      expect(typeof r.targetId).toBe('string');
    }

    // Views / diagrams
    expect(Array.isArray(res.ir.views)).toBe(true);
    expect(res.ir.views!.length).toBeGreaterThanOrEqual(5);

    const layered = res.ir.views!.find((v) => v.name === 'Layered View') ?? res.ir.views![0];
    expect(layered.nodes.length).toBeGreaterThanOrEqual(10);

    const withElementRef = layered.nodes.filter((n) => n.kind === 'element' && typeof n.elementId === 'string');
    expect(withElementRef.length).toBeGreaterThanOrEqual(Math.floor(layered.nodes.length / 2));

    expect(layered.connections.length).toBeGreaterThanOrEqual(5);
  });
});
