import { computeMiniColumnGraphLayout } from '../miniColumnGraphLayout';

import type { MiniColumnGraphEdge, MiniColumnGraphNode } from '../miniColumnGraphTypes';

function mapById<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

describe('miniColumnGraphLayout invariants', () => {
  test('is deterministic for the same input (stable node ordering + paths)', () => {
    const nodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha', level: 0 },
      { id: 'B', label: 'Beta', level: 1 },
      { id: 'C', label: 'Gamma', level: 1 },
      { id: 'D', label: 'Delta', level: 2 }
    ];
    const edges: MiniColumnGraphEdge[] = [
      { id: 'E1', from: 'A', to: 'B' },
      { id: 'E2', from: 'A', to: 'C' },
      { id: 'E3', from: 'C', to: 'D' }
    ];

    const res1 = computeMiniColumnGraphLayout({
      nodes,
      edges,
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });
    const res2 = computeMiniColumnGraphLayout({
      nodes,
      edges,
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    expect(res2).toEqual(res1);
  });

  test('x increases by level, and within a level y respects explicit order', () => {
    const nodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'A', level: 0 },
      { id: 'B', label: 'B', level: 1, order: 2 },
      { id: 'C', label: 'C', level: 1, order: 1 },
      { id: 'D', label: 'D', level: 2 }
    ];

    const res = computeMiniColumnGraphLayout({
      nodes,
      edges: [],
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    const n = mapById(res.nodes);
    expect(n.get('A')!.x).toBeLessThan(n.get('C')!.x);
    expect(n.get('C')!.x).toBeLessThan(n.get('D')!.x);

    // Order=1 should be above order=2.
    expect(n.get('C')!.y).toBeLessThan(n.get('B')!.y);
  });

  test('sizeScale is clamped to a small range (0.85–1.25)', () => {
    const baseNodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha', level: 0, sizeScale: 1 },
      { id: 'B', label: 'Beta', level: 1, sizeScale: 1 }
    ];

    const base = computeMiniColumnGraphLayout({
      nodes: baseNodes,
      edges: [],
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    const baseById = mapById(base.nodes);
    const baseA = baseById.get('A')!;
    const baseB = baseById.get('B')!;

    const extremeNodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha', level: 0, sizeScale: 10 }, // clamp up
      { id: 'B', label: 'Beta', level: 1, sizeScale: 0.01 } // clamp down
    ];

    const res = computeMiniColumnGraphLayout({
      nodes: extremeNodes,
      edges: [],
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    const n = mapById(res.nodes);

    expect(n.get('A')!.w).toBeCloseTo(baseA.w * 1.25, 5);
    expect(n.get('A')!.h).toBeCloseTo(baseA.h * 1.25, 5);

    expect(n.get('B')!.w).toBeCloseTo(baseB.w * 0.85, 5);
    expect(n.get('B')!.h).toBeCloseTo(baseB.h * 0.85, 5);
  });

  test('hidden nodes are excluded and edges to non-visible nodes are ignored', () => {
    const nodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha', level: 0 },
      { id: 'B', label: 'Beta', level: 1, hidden: true },
      { id: 'C', label: 'Gamma', level: 1 }
    ];
    const edges: MiniColumnGraphEdge[] = [
      { id: 'E1', from: 'A', to: 'B' }, // ignored
      { id: 'E2', from: 'A', to: 'C' }
    ];

    const res = computeMiniColumnGraphLayout({
      nodes,
      edges,
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    const ids = res.nodes.map((x) => x.id);
    expect(ids).toEqual(['A', 'C']);

    const pathsById = mapById(res.paths);
    expect(pathsById.has('E1')).toBe(false);
    expect(pathsById.has('E2')).toBe(true);
  });

  test('richLayoutMaxNodes disables wrap/autofit when graph is large', () => {
    const nodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha very long label that would normally wrap', level: 0 },
      { id: 'B', label: 'Beta very long label that would normally wrap', level: 1 }
    ];

    const res = computeMiniColumnGraphLayout({
      nodes,
      edges: [],
      wrapLabels: true,
      autoFitColumns: true,
      richLayoutMaxNodes: 1 // forces both features off
    });

    // When wrap is disabled, we clamp to maxLines=1.
    for (const n of res.nodes) {
      expect(n.lines).toHaveLength(1);
    }
  });

  test('long edges prefer orthogonal polyline routing while short edges use a curve', () => {
    const nodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha', level: 0 },
      { id: 'B', label: 'Beta', level: 1 },
      { id: 'C', label: 'Gamma', level: 2 }
    ];
    const edges: MiniColumnGraphEdge[] = [
      { id: 'Eshort', from: 'A', to: 'B' },
      { id: 'Elong', from: 'A', to: 'C' }
    ];

    const res = computeMiniColumnGraphLayout({
      nodes,
      edges,
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    const paths = mapById(res.paths);
    const shortD = paths.get('Eshort')?.d ?? '';
    const longD = paths.get('Elong')?.d ?? '';

    // Adjacent-column edges are rendered using a cubic curve ("C").
    expect(shortD).toContain('C');

    // Long edges route via polyline rounded corners ("Q") and should not be a cubic.
    expect(longD).toContain('Q');
    expect(longD).not.toContain('C');
  });

  test('layout dimensions are finite and non-negative', () => {
    const nodes: MiniColumnGraphNode[] = [
      { id: 'A', label: 'Alpha', level: 0 },
      { id: 'B', label: 'Beta', level: 0 },
      { id: 'C', label: 'Gamma', level: 1 }
    ];
    const res = computeMiniColumnGraphLayout({
      nodes,
      edges: [{ id: 'E1', from: 'A', to: 'C' }],
      wrapLabels: false,
      autoFitColumns: false,
      richLayoutMaxNodes: 999
    });

    expect(Number.isFinite(res.width)).toBe(true);
    expect(Number.isFinite(res.height)).toBe(true);
    expect(res.width).toBeGreaterThanOrEqual(0);
    expect(res.height).toBeGreaterThanOrEqual(0);
  });
});
