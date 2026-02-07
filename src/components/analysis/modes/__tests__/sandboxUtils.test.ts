import type { Model } from '../../../../domain';
import type { SandboxNode } from '../../workspace/controller/sandboxTypes';

import {
  buildNodeById,
  buildSandboxSubModel,
  buildSandboxRelationshipsModel,
  computeOverlayScalesFromScores,
  formatOverlayBadgesFromScores,
  getAllRelationshipTypes,
  getRelationshipTypesFromRendered,
} from '../sandboxUtils';

function makeModel(partial?: Partial<Model>): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test' },
    elements: {},
    relationships: {},
    views: {},
    folders: {},
    ...partial,
  };
}

describe('sandboxUtils', () => {
  test('buildNodeById creates a map keyed by elementId', () => {
    const nodes: SandboxNode[] = [
      { elementId: 'e1', x: 10, y: 20 },
      { elementId: 'e2', x: 30, y: 40 },
    ];
    const map = buildNodeById(nodes);
    expect(map.get('e1')?.x).toBe(10);
    expect(map.get('e2')?.y).toBe(40);
    expect(map.has('missing')).toBe(false);
  });

  test('buildSandboxSubModel filters elements to sandbox nodes and clears relationships', () => {
    const model = makeModel({
      elements: {
        e1: { id: 'e1', type: 'ApplicationComponent', name: 'A' },
        e2: { id: 'e2', type: 'DataObject', name: 'B' },
        e3: { id: 'e3', type: 'BusinessObject', name: 'C' },
      },
      relationships: {
        r1: { id: 'r1', type: 'Association', sourceElementId: 'e1', targetElementId: 'e2' },
      },
    });

    const nodes: SandboxNode[] = [
      { elementId: 'e1', x: 0, y: 0 },
      { elementId: 'e3', x: 0, y: 0 },
    ];

    const sub = buildSandboxSubModel(model, nodes);
    expect(Object.keys(sub.elements).sort()).toEqual(['e1', 'e3']);
    expect(Object.keys(sub.relationships)).toHaveLength(0);
  });

  test('buildSandboxRelationshipsModel seeds only rendered relationships', () => {
    const model = makeModel({
      elements: {
        e1: { id: 'e1', type: 'ApplicationComponent', name: 'A' },
        e2: { id: 'e2', type: 'DataObject', name: 'B' },
      },
      relationships: {
        r1: { id: 'r1', type: 'Association', sourceElementId: 'e1', targetElementId: 'e2' },
        r2: { id: 'r2', type: 'Serving', sourceElementId: 'e2', targetElementId: 'e1' },
      },
    });
    const sub = buildSandboxSubModel(model, [{ elementId: 'e1', x: 0, y: 0 }]);
    const seeded = buildSandboxRelationshipsModel(model, sub, [
      { id: 'r2', type: 'Serving', sourceElementId: 'e2', targetElementId: 'e1' },
    ]);
    expect(Object.keys(seeded.relationships)).toEqual(['r2']);
  });

  test('getAllRelationshipTypes returns sorted unique types', () => {
    const model = makeModel({
      relationships: {
        r1: { id: 'r1', type: 'Serving' },
        r2: { id: 'r2', type: 'Association' },
        r3: { id: 'r3', type: 'Association' },
        r4: { id: 'r4' },
      } as any,
    });
    expect(getAllRelationshipTypes(model)).toEqual(['Association', 'Serving']);
  });

  test('getRelationshipTypesFromRendered returns sorted unique types', () => {
    const rendered = [
      { id: 'r1', type: 'Serving', sourceElementId: 'a', targetElementId: 'b' },
      { id: 'r2', type: 'Association', sourceElementId: 'a', targetElementId: 'b' },
      { id: 'r3', type: 'Association', sourceElementId: 'a', targetElementId: 'b' },
    ];
    expect(getRelationshipTypesFromRendered(rendered as any)).toEqual(['Association', 'Serving']);
  });

  test('formatOverlayBadgesFromScores formats ints and floats and skips non-numbers', () => {
    const badges = formatOverlayBadgesFromScores({ a: 1, b: 1.2345, c: 'x', d: NaN });
    expect(badges).toEqual({ a: '1', b: '1.23' });
  });

  test('computeOverlayScalesFromScores scales values into range and defaults invalid to 1', () => {
    const scales = computeOverlayScalesFromScores({ a: 0, b: 10, c: 'x' }, { minScale: 0.5, maxScale: 1.5 });
    expect(scales?.a).toBeCloseTo(0.5);
    expect(scales?.b).toBeCloseTo(1.5);
    expect(scales?.c).toBe(1);
  });

  test('computeOverlayScalesFromScores returns all 1 when all numeric values equal', () => {
    const scales = computeOverlayScalesFromScores({ a: 3, b: 3 });
    expect(scales).toEqual({ a: 1, b: 1 });
  });
});
