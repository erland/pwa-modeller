import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model, Relationship } from '../../../../domain';
import type { AnalysisMode } from '../../AnalysisQueryPanel';

import type {
  SandboxNode,
  SandboxRelationshipVisibilityMode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesOptions,
  SandboxState,
  SandboxActions
} from './sandboxTypes';
export type {
  SandboxNode,
  SandboxRelationshipVisibilityMode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxState,
  SandboxActions
} from './sandboxTypes';

import type { PersistedSandboxStateV1 } from './sandboxPersistence';
import {
  clearPersistedSandboxState,
  loadPersistedSandboxState,
  savePersistedSandboxState,
} from './sandboxPersistence';

import {
  DEFAULT_SEED_POS,
  GRID_COLS,
  GRID_X,
  GRID_Y,
  SANDBOX_MAX_EDGES_DEFAULT,
  SANDBOX_MAX_NODES_DEFAULT,
  SANDBOX_NODE_H,
  SANDBOX_NODE_W,
} from './sandboxStateConstants';

import { applyNodeCap } from './sandboxStateCaps';

import {
  autoLayoutSandboxNodes,
  computeAppendBase,
  layoutGrid,
  seedFromElementsLayout,
  seedFromViewLayout,
} from './sandboxStateLayout';

import { computeIntermediatesNewNodes, computeRelatedNewNodes } from './sandboxStateInsertion';

import {
  clampInt,
  collectAllRelationshipTypes,
  toggleString,
  uniqSortedStrings,
} from './sandboxStateUtils';

/**
 * Owns Analysis Sandbox state.
 *
 * Step 1 scope:
 * - Local nodes with (elementId, x, y, pinned?)
 * - Drag/move support (position updates)
 * - Simple auto-seeding from current selection when entering Sandbox
 *
 * Step 2 scope:
 * - Add/remove/clear actions
 * - Accept element drops from the navigator
 *
 * Step 3 scope:
 * - Relationship visibility controls (hide/show + filter by relationship type)
 */
export function useSandboxState(args: {
  model: Model | null;
  modelId: string;
  mode: AnalysisMode;
  selectionElementIds: string[];
}) {
  const { model, modelId, mode, selectionElementIds } = args;

  const maxNodes = SANDBOX_MAX_NODES_DEFAULT;
  const maxEdges = SANDBOX_MAX_EDGES_DEFAULT;

  const [nodes, setNodes] = useState<SandboxNode[]>([]);
  const [showRelationships, setShowRelationships] = useState(true);
  const [relationshipMode, setRelationshipMode] = useState<SandboxRelationshipVisibilityMode>('all');
  const [enabledRelationshipTypes, setEnabledRelationshipTypes] = useState<string[]>([]);
  const [explicitRelationshipIds, setExplicitRelationshipIds] = useState<string[]>([]);

  const [warning, setWarning] = useState<string | null>(null);
  const [persistEnabled, setPersistEnabled] = useState(false);
  const [edgeRouting, setEdgeRouting] = useState<'straight' | 'orthogonal'>('straight');
  const [lastInsertedElementIds, setLastInsertedElementIds] = useState<string[]>([]);

  const [addRelatedDepth, setAddRelatedDepth] = useState(1);
  const [addRelatedDirection, setAddRelatedDirection] = useState<SandboxAddRelatedDirection>('both');
  const [addRelatedEnabledTypes, setAddRelatedEnabledTypes] = useState<string[]>([]);

  // Reset when switching to another model to avoid stale element ids.
  useEffect(() => {
    setNodes([]);
    setShowRelationships(true);
    setRelationshipMode('all');
    setEnabledRelationshipTypes([]);
    setExplicitRelationshipIds([]);

    setWarning(null);
    setPersistEnabled(false);
    setEdgeRouting('straight');
    setLastInsertedElementIds([]);

    setAddRelatedDepth(1);
    setAddRelatedDirection('both');
    setAddRelatedEnabledTypes([]);
  }, [modelId]);

  const emitWarning = useCallback((msg: string) => {
    setWarning((prev) => (prev === msg ? prev : msg));
  }, []);

  const clearWarning = useCallback(() => setWarning(null), []);

  const hydrateFromPersisted = useCallback(() => {
    if (!model) return;
    const persisted = loadPersistedSandboxState(modelId);
    if (!persisted) return;

    const nextNodesRaw: SandboxNode[] = persisted.nodes.filter((n) => Boolean(model.elements[n.elementId]));
    const capped = applyNodeCap({ prev: [], toAdd: nextNodesRaw, maxNodes });
    if (capped.dropped > 0) {
      emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
    }

    setNodes(capped.next);
    setLastInsertedElementIds([]);

    setShowRelationships(persisted.relationships.show);
    setRelationshipMode(persisted.relationships.mode ?? 'all');
    setEnabledRelationshipTypes(uniqSortedStrings(persisted.relationships.enabledTypes));
    setExplicitRelationshipIds(uniqSortedStrings(persisted.relationships.explicitIds));

    setAddRelatedDepth(clampInt(persisted.addRelated.depth, 1, 6));
    setAddRelatedDirection(persisted.addRelated.direction ?? 'both');
    setAddRelatedEnabledTypes(uniqSortedStrings(persisted.addRelated.enabledTypes));

    setEdgeRouting(persisted.ui.edgeRouting === 'orthogonal' ? 'orthogonal' : 'straight');
  }, [emitWarning, model, modelId, maxNodes]);


  // Persist sandbox state to sessionStorage if enabled.
  useEffect(() => {
    if (!persistEnabled) return;
    if (!model) return;

    const payload: PersistedSandboxStateV1 = {
      v: 1,
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
        explicitIds: explicitRelationshipIds,
      },
      addRelated: {
        depth: addRelatedDepth,
        direction: addRelatedDirection,
        enabledTypes: addRelatedEnabledTypes,
      },
      ui: {
        edgeRouting,
      },
    };

    savePersistedSandboxState(modelId, payload);
  }, [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, edgeRouting, enabledRelationshipTypes, explicitRelationshipIds, model, modelId, nodes, persistEnabled, relationshipMode, showRelationships]);


  const allRelationshipTypesForModel = useMemo(() => {
    if (!model) return [];
    return collectAllRelationshipTypes(model);
  }, [model]);

  // Default add-related type filter to all relationship types for the model.
  useEffect(() => {
    if (mode !== 'sandbox') return;
    if (!model) return;
    if (addRelatedEnabledTypes.length > 0) return;
    if (allRelationshipTypesForModel.length === 0) return;
    setAddRelatedEnabledTypes(allRelationshipTypesForModel);
  }, [addRelatedEnabledTypes.length, allRelationshipTypesForModel, mode, model]);

  const addManyIfMissing = useCallback(
    (elementIds: string[], baseX?: number, baseY?: number) => {
      if (!model) return;
      const valid = elementIds.filter((id) => Boolean(model.elements[id]));
      if (!valid.length) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));
        const toAdd = valid.filter((id) => !existing.has(id));
        if (!toAdd.length) return prev;

        const base =
          typeof baseX === 'number' && typeof baseY === 'number'
            ? { x: baseX, y: baseY }
            : computeAppendBase({ nodes: prev, defaultPos: DEFAULT_SEED_POS, gridX: GRID_X });

        const newNodes: SandboxNode[] = layoutGrid({ elementIds: toAdd, base, gridX: GRID_X, gridY: GRID_Y, gridCols: GRID_COLS });

        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }

        // Record undo info for the most recent insertion.
        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [emitWarning, maxNodes, model]
  );

  const addIfMissing = useCallback(
    (elementId: string, x?: number, y?: number) => {
      addManyIfMissing([elementId], x, y);
    },
    [addManyIfMissing]
  );

  const setNodePosition = useCallback((elementId: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.elementId === elementId ? { ...n, x, y } : n)));
  }, []);

  const removeMany = useCallback((elementIds: string[]) => {
    if (!elementIds.length) return;
    const remove = new Set(elementIds);
    setNodes((prev) => prev.filter((n) => !remove.has(n.elementId)));
    setLastInsertedElementIds([]);
  }, []);

  const clear = useCallback(() => {
    setNodes([]);
    setWarning(null);
    setLastInsertedElementIds([]);
  }, []);

  const undoLastInsert = useCallback(() => {
    if (lastInsertedElementIds.length === 0) return;
    const remove = new Set(lastInsertedElementIds);
    setNodes((prev) => prev.filter((n) => !remove.has(n.elementId)));
    setLastInsertedElementIds([]);
  }, [lastInsertedElementIds]);

  const setPersistEnabledSafe = useCallback(
    (enabled: boolean) => {
      setPersistEnabled(enabled);
      if (!enabled) {
        clearPersistedSandboxState(modelId);
        return;
      }
      // Only hydrate if the current sandbox is empty, to avoid surprising overwrites.
      if (nodes.length === 0) {
        hydrateFromPersisted();
      }
    },
    [hydrateFromPersisted, modelId, nodes.length]
  );

  // Auto-seed from selection when entering Sandbox and it is empty.
  useEffect(() => {
    if (mode !== 'sandbox') return;
    if (!model) return;
    if (nodes.length) return;
    const first = selectionElementIds[0];
    if (!first) return;
    if (!model.elements[first]) return;
    addIfMissing(first);
  }, [addIfMissing, model, mode, nodes.length, selectionElementIds]);

  const toggleEnabledRelationshipType = useCallback((type: string) => {
    setEnabledRelationshipTypes((prev) => toggleString(prev, type).sort((a, b) => a.localeCompare(b)));
  }, []);

  const setAddRelatedDepthSafe = useCallback((depth: number) => {
    setAddRelatedDepth(clampInt(depth, 1, 6));
  }, []);

  const setAddRelatedEnabledTypesSafe = useCallback((types: string[]) => {
    const uniq = Array.from(new Set(types));
    setAddRelatedEnabledTypes(uniq.sort((a, b) => a.localeCompare(b)));
  }, []);

  const toggleAddRelatedEnabledType = useCallback((type: string) => {
    setAddRelatedEnabledTypes((prev) => toggleString(prev, type).sort((a, b) => a.localeCompare(b)));
  }, []);

  const addRelatedFromSelection = useCallback(
    (anchorElementIds: string[], allowedElementIds?: string[]) => {
      if (!model) return;
      // enabled types act as the allowed relationship types used for traversal.
      if (addRelatedEnabledTypes.length === 0) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));

        const newNodes = computeRelatedNewNodes({
          model,
          existingNodes: prev,
          anchorElementIds,
          depth: addRelatedDepth,
          direction: addRelatedDirection,
          enabledRelationshipTypes: addRelatedEnabledTypes,
          allowedElementIds,
          nodeW: SANDBOX_NODE_W,
          nodeH: SANDBOX_NODE_H,
        });

        if (newNodes.length === 0) return prev;

        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }

        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, emitWarning, maxNodes, model]
  );


  const insertIntermediatesBetween = useCallback(
    (sourceElementId: string, targetElementId: string, options: SandboxInsertIntermediatesOptions) => {
      if (!model) return;
      if (!sourceElementId || !targetElementId) return;
      if (sourceElementId === targetElementId) return;
      if (addRelatedEnabledTypes.length === 0) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));

        const newNodes = computeIntermediatesNewNodes({
          model,
          existingNodes: prev,
          sourceElementId,
          targetElementId,
          options,
          enabledRelationshipTypes: addRelatedEnabledTypes,
          nodeW: SANDBOX_NODE_W,
          nodeH: SANDBOX_NODE_H,
        });

        if (newNodes.length === 0) return prev;
        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }
        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [addRelatedEnabledTypes, emitWarning, maxNodes, model]
  );

  const seedFromElements = useCallback(
    (args: {
      elementIds: string[];
      relationshipIds?: string[];
      relationshipTypes?: string[];
      layout?: {
        mode: 'grid' | 'distance' | 'levels';
        levelById?: Record<string, number>;
        orderById?: Record<string, number>;
      };
    }) => {
      if (!model) return;

      const inputIds = args.elementIds ?? [];
      const validIds = inputIds.filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
      const uniqIds = Array.from(new Set(validIds));
      if (uniqIds.length === 0) return;

      const mode = args.layout?.mode ?? 'grid';
      const levelById = args.layout?.levelById ?? {};
      const orderById = args.layout?.orderById ?? {};

      const margin = { x: 120, y: 120 };
      const nextNodes: SandboxNode[] = seedFromElementsLayout({
        elementIds: uniqIds,
        mode,
        levelById,
        orderById,
        margin,
        gridX: GRID_X,
        gridY: GRID_Y,
        gridCols: GRID_COLS,
      });

      const capped = applyNodeCap({ prev: [], toAdd: nextNodes, maxNodes });
      if (capped.dropped > 0) {
        emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
      }
      setNodes(capped.next);

      // Seed relationship visibility to match the source context.
      setShowRelationships(true);

      const relationshipIds = args.relationshipIds ? uniqSortedStrings(args.relationshipIds) : [];
      const relationshipTypes = args.relationshipTypes ? uniqSortedStrings(args.relationshipTypes) : [];

      if (relationshipIds.length > 0) {
        const validRelIds = relationshipIds.filter((id) => Boolean((model.relationships as Record<string, Relationship | undefined>)[id]));
        setRelationshipMode('explicit');
        setExplicitRelationshipIds(validRelIds);
      } else if (relationshipTypes.length > 0) {
        setRelationshipMode('types');
        setEnabledRelationshipTypes(relationshipTypes);
        setExplicitRelationshipIds([]);
      } else {
        setRelationshipMode('all');
        setEnabledRelationshipTypes([]);
        setExplicitRelationshipIds([]);
      }
    },
    [emitWarning, maxNodes, model]
  );

  const seedFromView = useCallback(
    (viewId: string) => {
      if (!model) return;
      const next = seedFromViewLayout({ model, viewId, margin: { x: 120, y: 120 } });
      if (next.length === 0) return;

      const capped = applyNodeCap({ prev: [], toAdd: next, maxNodes });
      if (capped.dropped > 0) {
        emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
      }
      setNodes(capped.next);
      setLastInsertedElementIds([]);
    },
    [emitWarning, maxNodes, model]
  );
  const autoLayout = useCallback(() => {
    if (!model) return;
    setNodes((prev) =>
      autoLayoutSandboxNodes({
        model,
        nodes: prev,
        showRelationships,
        relationshipMode,
        enabledRelationshipTypes,
        explicitRelationshipIds,
        margin: { x: 120, y: 120 },
        gridX: GRID_X,
        gridY: GRID_Y,
        gridCols: GRID_COLS,
      })
    );
  }, [enabledRelationshipTypes, explicitRelationshipIds, model, relationshipMode, showRelationships]);


  const state: SandboxState = useMemo(
    () => ({
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
        explicitIds: explicitRelationshipIds,
      },
      addRelated: {
        depth: addRelatedDepth,
        direction: addRelatedDirection,
        enabledTypes: addRelatedEnabledTypes,
      },
      ui: {
        warning,
        maxNodes,
        maxEdges,
        persistEnabled,
        edgeRouting,
        lastInsertedElementIds,
      },
    }),
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, edgeRouting, enabledRelationshipTypes, explicitRelationshipIds, lastInsertedElementIds, maxEdges, maxNodes, nodes, persistEnabled, relationshipMode, showRelationships, warning]
  );

  const actions: SandboxActions = useMemo(
    () => ({
      setNodePosition,
      addIfMissing,
      addManyIfMissing,
      removeMany,
      clear,
      undoLastInsert,
      seedFromView,

      autoLayout,
      setPersistEnabled: setPersistEnabledSafe,
      setEdgeRouting,
      clearWarning,

      seedFromElements,
      setShowRelationships,
      setRelationshipMode,
      setEnabledRelationshipTypes,
      setExplicitRelationshipIds,
      toggleEnabledRelationshipType,

      setAddRelatedDepth: setAddRelatedDepthSafe,
      setAddRelatedDirection,
      setAddRelatedEnabledTypes: setAddRelatedEnabledTypesSafe,
      toggleAddRelatedEnabledType,
      addRelatedFromSelection,

      insertIntermediatesBetween,
    }),
    [
      addIfMissing,
      addManyIfMissing,
      addRelatedFromSelection,
      autoLayout,
      clear,
      undoLastInsert,
      clearWarning,
      seedFromView,
      seedFromElements,
      removeMany,
      setPersistEnabledSafe,
      setEdgeRouting,
      setAddRelatedDepthSafe,
      setAddRelatedEnabledTypesSafe,
      setNodePosition,
      toggleAddRelatedEnabledType,
      toggleEnabledRelationshipType,

      insertIntermediatesBetween,
    ]
  );

  return { state, actions } as const;
}
