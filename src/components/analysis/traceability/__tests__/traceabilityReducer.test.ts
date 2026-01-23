import { createTraceabilityExplorerState, traceabilityReducer } from '../traceabilityReducer';
import type { ExpandRequest, TraceExpansionPatch } from '../../../../domain/analysis/traceability/types';

describe('traceabilityReducer', () => {
  test('seed creates initial state with selected first seed and pinned seeds by default', () => {
    const state = createTraceabilityExplorerState(['A', 'B']);
    expect(state.nodesById['A']).toBeTruthy();
    expect(state.nodesById['A'].pinned).toBe(true);
    expect(state.nodesById['B'].pinned).toBe(true);
    expect(state.selection.selectedNodeId).toBe('A');
    expect(state.pendingByNodeId).toEqual({});
  });

  test('expandRequested marks node expanded and pending', () => {
    const state0 = createTraceabilityExplorerState(['A']);
    const request: ExpandRequest = { nodeId: 'A', direction: 'both', depth: 1 };
    const state1 = traceabilityReducer(state0, { type: 'expandRequested', request });

    expect(state1.nodesById['A'].expanded).toBe(true);
    expect(state1.pendingByNodeId).toEqual({ A: true });
  });

  test('expandApplied merges patch and clears pending', () => {
    const state0 = traceabilityReducer(createTraceabilityExplorerState(['A']), {
      type: 'expandRequested',
      request: { nodeId: 'A', direction: 'both', depth: 1 }
    });

    const patch: TraceExpansionPatch = {
      rootNodeId: 'A',
      addedNodes: [{ id: 'B', depth: 1, pinned: false, expanded: false, hidden: false }],
      addedEdges: [{ id: 'R1:A->B', relationshipId: 'R1', from: 'A', to: 'B', type: 'Flow' }],
      frontierByNodeId: { B: ['A'] }
    };

    const request: ExpandRequest = { nodeId: 'A', direction: 'both', depth: 1 };
    const state1 = traceabilityReducer(state0, { type: 'expandApplied', request, patch });

    expect(state1.nodesById['B']).toBeTruthy();
    expect(state1.edgesById['R1:A->B']).toBeTruthy();
    expect(state1.pendingByNodeId).toEqual({});
    expect(state1.frontierByNodeId['B']).toEqual(['A']);
  });

  test('togglePin flips pin flag', () => {
    const state0 = createTraceabilityExplorerState(['A']);
    expect(state0.nodesById['A'].pinned).toBe(true);

    const state1 = traceabilityReducer(state0, { type: 'togglePin', nodeId: 'A' });
    expect(state1.nodesById['A'].pinned).toBe(false);

    const state2 = traceabilityReducer(state1, { type: 'togglePin', nodeId: 'A' });
    expect(state2.nodesById['A'].pinned).toBe(true);
  });

  test('collapseNode sets expanded=false', () => {
    const state0 = createTraceabilityExplorerState(['A'], { expandedSeeds: true });
    expect(state0.nodesById['A'].expanded).toBe(true);

    const state1 = traceabilityReducer(state0, { type: 'collapseNode', nodeId: 'A' });
    expect(state1.nodesById['A'].expanded).toBe(false);
  });


  test('expandApplied shifts added node depths by the expanded node depth (depth is relative to the original seed)', () => {
    // Seed A, add B as depth 1.
    const state0 = createTraceabilityExplorerState(['A'], { expandedSeeds: true });
    const state1 = traceabilityReducer(state0, {
      type: 'expandApplied',
      request: { nodeId: 'A', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'A',
        addedNodes: [{ id: 'B', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [],
        frontierByNodeId: { B: ['A'] }
      }
    });
    expect(state1.nodesById['B'].depth).toBe(1);

    // Now expand B; the expansion engine returns C with depth=1 relative to B,
    // but explorer depth should be 2 (relative to A).
    const state2 = traceabilityReducer(state1, {
      type: 'expandApplied',
      request: { nodeId: 'B', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'B',
        addedNodes: [{ id: 'C', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [],
        frontierByNodeId: { C: ['B'] }
      }
    });
    expect(state2.nodesById['C'].depth).toBe(2);
  });

  test('loadSession replaces state', () => {
    const s0 = createTraceabilityExplorerState(['A']);
    const s1 = createTraceabilityExplorerState(['X']);
    const loaded = traceabilityReducer(s0, { type: 'loadSession', state: s1 });
    expect(loaded.nodesById['X']).toBeTruthy();
    expect(loaded.nodesById['A']).toBeUndefined();
  });

  test('setFilters merges into existing filters', () => {
    const state0 = createTraceabilityExplorerState(['A']);
    const state1 = traceabilityReducer(state0, { type: 'setFilters', filters: { direction: 'incoming', relationshipTypes: ['Flow'] } });
    expect(state1.filters.direction).toBe('incoming');
    expect(state1.filters.relationshipTypes).toEqual(['Flow']);
  });

  test('collapse hides back/cross edges from the collapsed node (edges to same/earlier depth remain hidden until expand)', () => {
    // Build a small graph: A(depth0) -> B(depth1) -> C(depth2), plus C -> A (back edge), plus C -> D(depth3).
    let state = createTraceabilityExplorerState(['A'], { expandedSeeds: true });

    // Add B as child of A
    state = traceabilityReducer(state, {
      type: 'expandApplied',
      request: { nodeId: 'A', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'A',
        addedNodes: [{ id: 'B', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [{ id: 'eAB', from: 'A', to: 'B' }],
        frontierByNodeId: { B: ['A'] }
      }
    });

    // Add C as child of B
    state = traceabilityReducer(state, {
      type: 'expandApplied',
      request: { nodeId: 'B', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'B',
        addedNodes: [{ id: 'C', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [{ id: 'eBC', from: 'B', to: 'C' }],
        frontierByNodeId: { C: ['B'] }
      }
    });

    // Add D as child of C and a back-edge C->A
    state = traceabilityReducer(state, {
      type: 'expandApplied',
      request: { nodeId: 'C', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'C',
        addedNodes: [{ id: 'D', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [
          { id: 'eCD', from: 'C', to: 'D' },
          { id: 'eCA', from: 'C', to: 'A' }
        ],
        frontierByNodeId: { D: ['C'] }
      }
    });

    // Collapse C: D should be hidden (descendant), and C->A should be hidden as back edge.
    state = traceabilityReducer(state, { type: 'collapseNode', nodeId: 'C' });

    expect(state.nodesById['D'].hidden).toBe(true);
    expect(state.edgesById['eCA'].hidden).toBe(true);

    // Expanding C should unhide C-origin edges (including back edge), but not necessarily restore hidden nodes (handled by expansion).
    state = traceabilityReducer(state, { type: 'expandRequested', request: { nodeId: 'C', direction: 'both', depth: 1 } });
    expect(state.edgesById['eCA'].hidden).toBe(false);
  });


  test('expandApplied can unhide previously hidden nodes (re-expanding restores known neighbours)', () => {
    let state = createTraceabilityExplorerState(['A'], { expandedSeeds: true });

    // Add B as neighbour
    state = traceabilityReducer(state, {
      type: 'expandApplied',
      request: { nodeId: 'A', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'A',
        addedNodes: [{ id: 'B', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [{ id: 'eAB', from: 'A', to: 'B' }],
        frontierByNodeId: { B: ['A'] }
      }
    });
    expect(state.nodesById['B'].hidden).toBe(false);

    // Simulate collapse hiding B
    state = traceabilityReducer(state, { type: 'collapseNode', nodeId: 'A' });
    expect(state.nodesById['B'].hidden).toBe(true);

    // Re-expansion patch should make B visible again
    state = traceabilityReducer(state, {
      type: 'expandApplied',
      request: { nodeId: 'A', direction: 'both', depth: 1 },
      patch: {
        rootNodeId: 'A',
        addedNodes: [{ id: 'B', depth: 1, pinned: false, expanded: false, hidden: false }],
        addedEdges: [{ id: 'eAB', from: 'A', to: 'B' }],
        frontierByNodeId: { B: ['A'] }
      }
    });

    expect(state.nodesById['B'].hidden).toBe(false);
  });
});
