export type TraceDirection = 'incoming' | 'outgoing' | 'both';

/**
 * A lightweight node used by the Traceability Explorer.
 *
 * Notes:
 * - `depth` is the minimum discovered distance from any seed node.
 * - UI concerns (position, styling) are intentionally not included.
 */
export type TraceNode = {
  id: string;
  /** Minimum discovered distance from any seed node. */
  depth: number;
  pinned: boolean;
  expanded: boolean;
  hidden: boolean;
};

/**
 * A lightweight edge used by the Traceability Explorer.
 *
 * `relationshipId` is optional to allow synthetic edges (future use).
 */
export type TraceEdge = {
  /** Stable edge id within the explorer graph. */
  id: string;
  relationshipId?: string;
  from: string;
  to: string;
  /** Relationship type (or other edge kind). */
  type?: string;
};

/**
 * Tracks where a node was discovered from.
 *
 * This is intentionally minimal in v1: it lets later steps implement
 * collapse/hide logic without needing to re-traverse the full model.
 */
export type TraceFrontier = Record<string, string[]>;

export type TraceFilters = {
  direction: TraceDirection;
  relationshipTypes?: string[];
  layers?: string[];
  elementTypes?: string[];
};

export type TraceSelection = {
  selectedNodeId?: string;
  selectedEdgeId?: string;
};

export type TraceGraphState = {
  nodesById: Record<string, TraceNode>;
  edgesById: Record<string, TraceEdge>;
  /** For each nodeId, which parent nodeIds introduced it. */
  frontierByNodeId: TraceFrontier;
  selection: TraceSelection;
  filters: TraceFilters;
  maxDepthDefault: number;
};

export type StopConditions = {
  stopAtDepth?: number;
  stopAtLayer?: string[];
  stopAtType?: string[];
};

export type ExpandRequest = {
  nodeId: string;
  direction: TraceDirection;
  depth: number;
  relationshipTypes?: string[];
  layers?: string[];
  elementTypes?: string[];
  stopConditions?: StopConditions;
};

export type TraceExpansionPatch = {
  rootNodeId: string;
  addedNodes: TraceNode[];
  addedEdges: TraceEdge[];
  /** For each added node, which parent(s) introduced it. */
  frontierByNodeId?: TraceFrontier;
};

export type CreateInitialTraceGraphOptions = {
  pinnedSeeds?: boolean;
  expandedSeeds?: boolean;
  maxDepthDefault?: number;
  filters?: Partial<TraceFilters>;
  selection?: TraceSelection;
};

function uniqPush(arr: string[] | undefined, v: string): string[] {
  if (!arr) return [v];
  if (arr.includes(v)) return arr;
  return [...arr, v];
}

function mergeFrontier(a: TraceFrontier, b?: TraceFrontier): TraceFrontier {
  if (!b) return a;
  const out: TraceFrontier = { ...a };
  for (const [k, parents] of Object.entries(b)) {
    let cur = out[k];
    for (const p of parents) cur = uniqPush(cur, p);
    out[k] = cur ?? [];
  }
  return out;
}

function mergeNode(existing: TraceNode | undefined, added: TraceNode): TraceNode {
  if (!existing) return added;
  return {
    ...existing,
    // Preserve existing flags but allow pinning to be additive.
    pinned: existing.pinned || added.pinned,
    // Expanded is additive as well.
    expanded: existing.expanded || added.expanded,
    // If a node is hidden in any state, keep it hidden.
    hidden: existing.hidden || added.hidden,
    // Keep the minimum discovered depth.
    depth: Math.min(existing.depth, added.depth)
  };
}

/**
 * Create an initial explorer state seeded by one or more element ids.
 */
export function createInitialTraceGraph(seedIds: string[], options?: CreateInitialTraceGraphOptions): TraceGraphState {
  const pinnedSeeds = options?.pinnedSeeds ?? true;
  const expandedSeeds = options?.expandedSeeds ?? false;
  const maxDepthDefault = options?.maxDepthDefault ?? 3;

  const nodesById: Record<string, TraceNode> = {};
  for (const id of seedIds) {
    nodesById[id] = {
      id,
      depth: 0,
      pinned: pinnedSeeds,
      expanded: expandedSeeds,
      hidden: false
    };
  }

  const defaultFilters: TraceFilters = {
    direction: 'both'
  };

  const selection: TraceSelection = options?.selection ?? {
    selectedNodeId: seedIds[0]
  };

  return {
    nodesById,
    edgesById: {},
    frontierByNodeId: {},
    selection,
    filters: { ...defaultFilters, ...(options?.filters ?? {}) },
    maxDepthDefault
  };
}

/**
 * Apply a patch produced by the (future) expansion engine.
 *
 * This function is intentionally conservative:
 * - it is idempotent (re-applying the same patch yields the same result)
 * - it merges nodes/edges by id
 */
export function applyExpansion(state: TraceGraphState, patch: TraceExpansionPatch): TraceGraphState {
  const nodesById: Record<string, TraceNode> = { ...state.nodesById };
  const edgesById: Record<string, TraceEdge> = { ...state.edgesById };

  // Ensure the root exists and is marked expanded.
  const rootExisting = nodesById[patch.rootNodeId];
  if (rootExisting) nodesById[patch.rootNodeId] = { ...rootExisting, expanded: true };
  else {
    nodesById[patch.rootNodeId] = {
      id: patch.rootNodeId,
      depth: 0,
      pinned: false,
      expanded: true,
      hidden: false
    };
  }

  for (const n of patch.addedNodes) nodesById[n.id] = mergeNode(nodesById[n.id], n);
  for (const e of patch.addedEdges) edgesById[e.id] = edgesById[e.id] ?? e;

  return {
    ...state,
    nodesById,
    edgesById,
    frontierByNodeId: mergeFrontier(state.frontierByNodeId, patch.frontierByNodeId)
  };
}
