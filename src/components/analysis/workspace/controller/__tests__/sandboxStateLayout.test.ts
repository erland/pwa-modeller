import type { Model } from '../../../../../domain';

import {
  autoLayoutSandboxNodes,
  computeAppendBase,
  layoutGrid,
  seedFromElementsLayout,
  seedFromViewLayout,
} from '../sandboxStateLayout';

function mkModel(partial: Partial<Model>): Model {
  return {
    elements: {},
    relationships: {},
    folders: {},
    views: {},
    ...partial,
  } as unknown as Model;
}

describe('sandboxStateLayout invariants', () => {
  test('computeAppendBase returns default when empty, otherwise uses max x and min y', () => {
    expect(
      computeAppendBase({
        nodes: [],
        defaultPos: { x: 10, y: 20 },
        gridX: 100,
      })
    ).toEqual({ x: 10, y: 20 });

    expect(
      computeAppendBase({
        nodes: [
          { elementId: 'A', x: 0, y: 50, pinned: false },
          { elementId: 'B', x: 200, y: 10, pinned: false },
        ],
        defaultPos: { x: 10, y: 20 },
        gridX: 100,
      })
    ).toEqual({ x: 300, y: 10 });
  });

  test('layoutGrid places ids in a stable grid pattern', () => {
    const nodes = layoutGrid({
      elementIds: ['A', 'B', 'C'],
      base: { x: 0, y: 0 },
      gridX: 100,
      gridY: 50,
      gridCols: 2,
    });

    expect(nodes.map((n) => ({ id: n.elementId, x: n.x, y: n.y }))).toEqual([
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 100, y: 0 },
      { id: 'C', x: 0, y: 50 },
    ]);
  });

  test('seedFromViewLayout uses only valid unique elements, carries pinned, and normalizes to margin', () => {
    const model = mkModel({
      elements: {
        A: { id: 'A', name: 'A', type: 'T' },
        B: { id: 'B', name: 'B', type: 'T' },
      } as any,
      views: {
        V1: {
          id: 'V1',
          name: 'View',
          nodes: [],
          layout: {
            nodes: [
              { id: 'VN1', elementId: 'B', x: 20, y: 30 },
              { id: 'VN2', elementId: 'A', x: 10, y: 10, locked: true },
              { id: 'VN3', elementId: 'A', x: 999, y: 999 }, // duplicate element
              { id: 'VN4', x: 5, y: 5 }, // no elementId
            ],
            relationships: [],
          },
        },
      } as any,
    });

    const seeded = seedFromViewLayout({ model, viewId: 'V1', margin: { x: 100, y: 200 } });
    // normalized by minX/minY (10/10) then + margin
    expect(seeded).toEqual([
      { elementId: 'B', x: 110, y: 220, pinned: false },
      { elementId: 'A', x: 100, y: 200, pinned: true },
    ]);
  });

  test('seedFromElementsLayout distance mode respects level and stable order within a level', () => {
    const nodes = seedFromElementsLayout({
      elementIds: ['B', 'A', 'C'],
      mode: 'distance',
      levelById: { A: 0, B: 1, C: 1 },
      margin: { x: 0, y: 0 },
      gridX: 100,
      gridY: 50,
      gridCols: 2,
    });

    expect(nodes.map((n) => ({ id: n.elementId, x: n.x, y: n.y }))).toEqual([
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 100, y: 0 },
      { id: 'C', x: 100, y: 50 },
    ]);
  });

  test('autoLayoutSandboxNodes keeps pinned nodes fixed and produces finite positions', () => {
    const model = mkModel({
      elements: {
        A: { id: 'A', name: 'A', type: 'T' },
        B: { id: 'B', name: 'B', type: 'T' },
      } as any,
    });

    const nodes = [
      { elementId: 'A', x: 10, y: 10, pinned: true },
      { elementId: 'B', x: 0, y: 0, pinned: false },
    ];

    const next = autoLayoutSandboxNodes({
      model,
      nodes,
      showRelationships: false,
      relationshipMode: 'all',
      enabledRelationshipTypes: [],
      explicitRelationshipIds: [],
      direction: 'both',
      gridX: 100,
      gridY: 50,
      gridCols: 3,
      margin: { x: 0, y: 0 },
    });

    const a = next.find((n) => n.elementId === 'A')!;
    const b = next.find((n) => n.elementId === 'B')!;

    expect(a.x).toBe(10);
    expect(a.y).toBe(10);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
  });
});
