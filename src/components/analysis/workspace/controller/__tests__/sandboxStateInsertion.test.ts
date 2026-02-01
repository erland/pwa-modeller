import type { Model } from '../../../../../domain';

import { computeIntermediatesNewNodes, computeRelatedNewNodes } from '../sandboxStateInsertion';

function mkModel(partial: Partial<Model>): Model {
  return {
    elements: {},
    relationships: {},
    folders: {},
    views: {},
    ...partial,
  } as unknown as Model;
}

describe('sandboxStateInsertion', () => {
  test('computeIntermediatesNewNodes returns intermediate nodes on a simple chain', () => {
    const model = mkModel({
      elements: {
        A: { id: 'A', name: 'Alpha', type: 'T' },
        B: { id: 'B', name: 'Beta', type: 'T' },
        C: { id: 'C', name: 'Gamma', type: 'T' },
      } as any,
      relationships: {
        R1: { id: 'R1', sourceElementId: 'A', targetElementId: 'B', type: 'Flow' },
        R2: { id: 'R2', sourceElementId: 'B', targetElementId: 'C', type: 'Flow' },
      } as any,
    });

    const res = computeIntermediatesNewNodes({
      model,
      existingNodes: [
        { elementId: 'A', x: 100, y: 100, pinned: false },
        { elementId: 'C', x: 300, y: 100, pinned: false },
      ],
      sourceElementId: 'A',
      targetElementId: 'C',
      options: { mode: 'shortest', k: 10, maxHops: 16, direction: 'outgoing' },
      enabledRelationshipTypes: ['Flow'],
      nodeW: 120,
      nodeH: 60,
    });

    expect(res.map((n) => n.elementId)).toEqual(['B']);

    // Position invariant: the intermediate is placed roughly between A and C.
    expect(res[0].x).toBeCloseTo(200, 2);
    expect(res[0].y).toBeCloseTo(100, 2);
  });

  test('computeRelatedNewNodes returns neighbors and does not overlap existing node centers', () => {
    const model = mkModel({
      elements: {
        A: { id: 'A', name: 'Alpha', type: 'T' },
        B: { id: 'B', name: 'Beta', type: 'T' },
        C: { id: 'C', name: 'Gamma', type: 'T' },
      } as any,
      relationships: {
        R1: { id: 'R1', sourceElementId: 'A', targetElementId: 'B', type: 'Flow' },
        R2: { id: 'R2', sourceElementId: 'B', targetElementId: 'C', type: 'Flow' },
      } as any,
    });

    const existingNodes = [{ elementId: 'A', x: 100, y: 100, pinned: false }];

    const res = computeRelatedNewNodes({
      model,
      existingNodes,
      anchorElementIds: ['A'],
      depth: 2,
      direction: 'both',
      enabledRelationshipTypes: ['Flow'],
      nodeW: 120,
      nodeH: 60,
      margin: { x: 0, y: 0 },
    });

    const ids = res.map((n) => n.elementId);
    expect(ids).toEqual(expect.arrayContaining(['B', 'C']));

    const a = existingNodes[0];
    for (const n of res) {
      // Centers shouldn't coincide with the existing center.
      expect(!(n.x === a.x && n.y === a.y)).toBe(true);
    }

    // No duplicates
    expect(new Set(ids).size).toBe(ids.length);
  });
});