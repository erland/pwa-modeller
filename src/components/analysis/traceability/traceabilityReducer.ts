import { applyExpansion, createInitialTraceGraph } from '../../../domain/analysis/traceability/types';
import type {
  CreateInitialTraceGraphOptions,
  ExpandRequest,
  TraceFilters,
  TraceGraphState,
  TraceSelection,
  TraceExpansionPatch
} from '../../../domain/analysis/traceability/types';

/**
 * Local (UI) state for the Traceability Explorer.
 *
 * This extends the pure domain TraceGraphState with ephemeral UI flags like pending expansions.
 */
export type TraceabilityExplorerState = TraceGraphState & {
  pendingByNodeId: Record<string, boolean>;
  lastExpandRequest?: ExpandRequest;
};

export type SeedAction = {
  type: 'seed';
  seedIds: string[];
  options?: CreateInitialTraceGraphOptions;
};

export type ResetAction = {
  type: 'reset';
  seedIds: string[];
  options?: CreateInitialTraceGraphOptions;
};

export type ExpandRequestedAction = {
  type: 'expandRequested';
  request: ExpandRequest;
};

export type ExpandAppliedAction = {
  type: 'expandApplied';
  request: ExpandRequest;
  patch: TraceExpansionPatch;
};

export type TogglePinAction = {
  type: 'togglePin';
  nodeId: string;
};

export type ToggleExpandedAction = {
  type: 'toggleExpanded';
  nodeId: string;
};

export type CollapseNodeAction = {
  type: 'collapseNode';
  nodeId: string;
};

export type SelectNodeAction = {
  type: 'selectNode';
  nodeId: string | undefined;
};

export type SelectEdgeAction = {
  type: 'selectEdge';
  edgeId: string | undefined;
};

export type SetFiltersAction = {
  type: 'setFilters';
  filters: Partial<TraceFilters>;
};

export type SetSelectionAction = {
  type: 'setSelection';
  selection: TraceSelection;
};

export type TraceabilityAction =
  | SeedAction
  | ResetAction
  | ExpandRequestedAction
  | ExpandAppliedAction
  | TogglePinAction
  | ToggleExpandedAction
  | CollapseNodeAction
  | SelectNodeAction
  | SelectEdgeAction
  | SetFiltersAction
  | SetSelectionAction;

export function createTraceabilityExplorerState(seedIds: string[], options?: CreateInitialTraceGraphOptions): TraceabilityExplorerState {
  return {
    ...createInitialTraceGraph(seedIds, options),
    pendingByNodeId: {}
  };
}

function setNodeFlag(state: TraceabilityExplorerState, nodeId: string, patch: Partial<{ pinned: boolean; expanded: boolean; hidden: boolean }>) {
  const node = state.nodesById[nodeId];
  if (!node) return state;
  return {
    ...state,
    nodesById: {
      ...state.nodesById,
      [nodeId]: { ...node, ...patch }
    }
  };
}


function assertNever(x: never): never {
  throw new Error(`Unhandled TraceabilityAction: ${JSON.stringify(x)}`);
}


function computeHideSet(state: TraceabilityExplorerState, rootId: string): Set<string> {
  const hidden = new Set<string>();
  const queue: string[] = [rootId];

  // Build reverse provenance: parentId -> childIds
  const childrenByParent: Record<string, string[]> = {};
  for (const [childId, parents] of Object.entries(state.frontierByNodeId)) {
    for (const p of parents) {
      if (!childrenByParent[p]) childrenByParent[p] = [];
      childrenByParent[p].push(childId);
    }
  }

  const canHide = (id: string, parents: string[]): boolean => {
    const node = state.nodesById[id];
    if (!node) return false;
    if (node.pinned) return false;

    // Hide only if ALL parents are within the subtree being hidden (root or already hidden).
    for (const p of parents) {
      if (p === rootId) continue;
      if (!hidden.has(p)) return false;
    }
    return true;
  };

  while (queue.length) {
    const parent = queue.shift()!;
    const children = childrenByParent[parent] ?? [];
    for (const c of children) {
      if (hidden.has(c)) continue;
      const parents = state.frontierByNodeId[c] ?? [parent];
      if (!canHide(c, parents)) continue;
      hidden.add(c);
      queue.push(c);
    }
  }

  return hidden;
}

function applyHiddenFlags(state: TraceabilityExplorerState, hide: Set<string>, hiddenValue: boolean): TraceabilityExplorerState {
  if (hide.size === 0) return state;
  const nodesById = { ...state.nodesById };
  for (const id of hide) {
    const node = nodesById[id];
    if (!node) continue;
    nodesById[id] = { ...node, hidden: hiddenValue };
  }
  return { ...state, nodesById };
}
export function traceabilityReducer(state: TraceabilityExplorerState, action: TraceabilityAction): TraceabilityExplorerState {
  switch (action.type) {
    case 'seed':
    case 'reset': {
      return createTraceabilityExplorerState(action.seedIds, action.options);
    }

    case 'setFilters': {
      return {
        ...state,
        filters: { ...state.filters, ...action.filters }
      };
    }

    case 'setSelection': {
      return {
        ...state,
        selection: { ...action.selection }
      };
    }

    case 'selectNode': {
      return {
        ...state,
        selection: { selectedNodeId: action.nodeId, selectedEdgeId: undefined }
      };
    }

    case 'selectEdge': {
      return {
        ...state,
        selection: { selectedNodeId: undefined, selectedEdgeId: action.edgeId }
      };
    }

    case 'togglePin': {
      const node = state.nodesById[action.nodeId];
      if (!node) return state;
      return setNodeFlag(state, action.nodeId, { pinned: !node.pinned });
    }

    case 'toggleExpanded': {
      const node = state.nodesById[action.nodeId];
      if (!node) return state;
      return setNodeFlag(state, action.nodeId, { expanded: !node.expanded });
    }

    case 'collapseNode': {
      const next = setNodeFlag(state, action.nodeId, { expanded: false });
      const hideSet = computeHideSet(next, action.nodeId);
      return applyHiddenFlags(next, hideSet, true);
    }

    case 'expandRequested': {
      const nodeId = action.request.nodeId;
      return {
        ...setNodeFlag(state, nodeId, { expanded: true }),
        pendingByNodeId: { ...state.pendingByNodeId, [nodeId]: true },
        lastExpandRequest: action.request
      };
    }

    case 'expandApplied': {
      const nodeId = action.request.nodeId;
      const nextGraph = applyExpansion(state, action.patch);
      const { [nodeId]: _removed, ...restPending } = state.pendingByNodeId;
      return {
        ...(nextGraph as TraceabilityExplorerState),
        pendingByNodeId: restPending,
        lastExpandRequest: action.request
      };
    }

    default: {
      return assertNever(action as never);
    }
}
}
