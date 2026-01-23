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
      // v1: just mark the node as not expanded. (Step 5 will add subtree hide rules via frontier provenance.)
      return setNodeFlag(state, action.nodeId, { expanded: false });
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
