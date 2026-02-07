import { adjustEdgeRoutesForMovedNodes } from '../adjustEdgeRoutesForMovedNodes';
import type { LayoutEdge } from '../../types';

describe('adjustEdgeRoutesForMovedNodes', () => {
  const edges: LayoutEdge[] = [{ id: 'e1', sourceId: 'A', targetId: 'B' }];

  const baseRoutes = {
    e1: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
    legacy: { points: [{ x: 1, y: 2 }] }
  };

  test('returns undefined when edgeRoutes is undefined', () => {
    const out = adjustEdgeRoutesForMovedNodes(undefined, edges, {}, {});
    expect(out).toBeUndefined();
  });

  test('no-op movement preserves the same route object reference', () => {
    const from = { A: { x: 0, y: 0 }, B: { x: 10, y: 10 } };
    const to = { ...from };
    const out = adjustEdgeRoutesForMovedNodes(baseRoutes, edges, from, to)!;

    // defensive copy includes legacy too
    expect(out.legacy).toBe(baseRoutes.legacy);
    // route object for e1 is reused when delta is (0,0)
    expect(out.e1).toBe(baseRoutes.e1);
  });

  test('shifts points by the average of source+target deltas (target stationary -> half source delta)', () => {
    const from = { A: { x: 0, y: 0 }, B: { x: 10, y: 10 } };
    const to = { A: { x: 5, y: -2 }, B: { x: 10, y: 10 } }; // only source moved

    const out = adjustEdgeRoutesForMovedNodes(baseRoutes, edges, from, to)!;
    expect(out.e1).not.toBe(baseRoutes.e1);

    // ds=(+5,-2), dt=(0,0) => average=(+2.5,-1)
    expect(out.e1.points).toEqual([
      { x: 2.5, y: -1 },
      { x: 12.5, y: 9 }
    ]);
  });

  test('shifts points by the average of source+target deltas (source stationary -> half target delta)', () => {
    const from = { A: { x: 0, y: 0 }, B: { x: 10, y: 10 } };
    const to = { A: { x: 0, y: 0 }, B: { x: -4, y: 6 } }; // only target moved

    const out = adjustEdgeRoutesForMovedNodes(baseRoutes, edges, from, to)!;

    // ds=(0,0), dt=(-14,-4) => average=(-7,-2)
    expect(out.e1.points).toEqual([
      { x: -7, y: -2 },
      { x: 3, y: 8 }
    ]);
  });

  test('shifts points by the average delta when both source and target moved', () => {
    const from = { A: { x: 0, y: 0 }, B: { x: 10, y: 10 } };
    const to = { A: { x: 6, y: 0 }, B: { x: 8, y: 14 } };

    // ds=(+6,0), dt=(-2,+4) => average=(+2,+2)
    const out = adjustEdgeRoutesForMovedNodes(baseRoutes, edges, from, to)!;
    expect(out.e1.points).toEqual([
      { x: 2, y: 2 },
      { x: 12, y: 12 }
    ]);
  });

  test('keeps any routes that are not tied to an explicit edge (legacy ids)', () => {
    const from = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };
    const to = { A: { x: 1, y: 1 }, B: { x: 0, y: 0 } };

    const out = adjustEdgeRoutesForMovedNodes(baseRoutes, edges, from, to)!;
    expect(out.legacy).toBe(baseRoutes.legacy);
  });

  test('skips edges with missing/empty points without crashing', () => {
    const routes = { ...baseRoutes, e1: { points: [] as Array<{ x: number; y: number }> } };
    const from = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };
    const to = { A: { x: 10, y: 10 }, B: { x: 0, y: 0 } };

    const out = adjustEdgeRoutesForMovedNodes(routes, edges, from, to)!;
    // e1 not replaced/adjusted, but preserved by legacy-preservation loop
    expect(out.e1).toBe(routes.e1);
  });
});
