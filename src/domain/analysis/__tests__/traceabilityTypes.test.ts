import { applyExpansion, createInitialTraceGraph } from '../index';

describe('traceability explorer types (pure domain)', () => {
  test('createInitialTraceGraph seeds nodes with sensible defaults', () => {
    const s = createInitialTraceGraph(['A', 'B']);

    expect(Object.keys(s.nodesById).sort()).toEqual(['A', 'B']);
    expect(s.nodesById['A']).toEqual({
      id: 'A',
      depth: 0,
      pinned: true,
      expanded: false,
      hidden: false
    });
    expect(s.selection.selectedNodeId).toBe('A');
    expect(s.edgesById).toEqual({});
    expect(s.frontierByNodeId).toEqual({});
    expect(s.maxDepthDefault).toBe(3);
    expect(s.filters.direction).toBe('both');
  });

  test('applyExpansion merges nodes, edges and frontier idempotently and marks root expanded', () => {
    const s0 = createInitialTraceGraph(['A'], { pinnedSeeds: true });

    const patch = {
      rootNodeId: 'A',
      addedNodes: [
        { id: 'B', depth: 1, pinned: false, expanded: false, hidden: false },
        { id: 'C', depth: 2, pinned: true, expanded: false, hidden: false }
      ],
      addedEdges: [
        { id: 'E1', relationshipId: 'R1', from: 'A', to: 'B', type: 'Serving' },
        { id: 'E2', relationshipId: 'R2', from: 'B', to: 'C', type: 'Flow' }
      ],
      frontierByNodeId: {
        B: ['A'],
        C: ['B']
      }
    };

    const s1 = applyExpansion(s0, patch);
    expect(s1.nodesById['A']?.expanded).toBe(true);
    expect(Object.keys(s1.nodesById).sort()).toEqual(['A', 'B', 'C']);
    expect(Object.keys(s1.edgesById).sort()).toEqual(['E1', 'E2']);
    expect(s1.frontierByNodeId).toEqual({ B: ['A'], C: ['B'] });

    // Reapplying the same patch should not duplicate anything.
    const s2 = applyExpansion(s1, patch);
    expect(s2).toEqual(s1);

    // Merge semantics: pinning is additive, and depth is minimized.
    const patch2 = {
      rootNodeId: 'B',
      addedNodes: [{ id: 'C', depth: 99, pinned: false, expanded: false, hidden: false }],
      addedEdges: [],
      frontierByNodeId: { C: ['A'] }
    };

    const s3 = applyExpansion(s2, patch2);
    expect(s3.nodesById['C']?.pinned).toBe(true); // stays pinned
    expect(s3.nodesById['C']?.depth).toBe(2); // min depth preserved
    expect(s3.frontierByNodeId['C']?.sort()).toEqual(['A', 'B']);
  });
});
