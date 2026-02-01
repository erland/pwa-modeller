import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import type { AnalysisMode } from '../../AnalysisQueryPanel';

import type {
  SandboxAddRelatedDirection,
  SandboxNode,
  SandboxRelationshipVisibilityMode,
  SandboxState,
  SandboxActions,
} from './sandboxTypes';
export type {
  SandboxNode,
  SandboxRelationshipVisibilityMode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxState,
  SandboxActions,
} from './sandboxTypes';

import {
  SANDBOX_MAX_EDGES_DEFAULT,
  SANDBOX_MAX_NODES_DEFAULT,
} from './sandboxStateConstants';

import { clampInt, collectAllRelationshipTypes, toggleString } from './sandboxStateUtils';

import { useSandboxWarnings } from './useSandboxWarnings';
import { useSandboxBasicsActions } from './useSandboxBasicsActions';
import { useSandboxSeedingActions } from './useSandboxSeedingActions';
import { useSandboxGraphActions } from './useSandboxGraphActions';
import { useSandboxPersistenceController } from './useSandboxPersistenceController';
import { useSandboxAutoSeedFromSelection } from './useSandboxAutoSeedFromSelection';

/**
 * Owns Analysis Sandbox state (nodes + relationship visibility + add-related/insert intermediates settings).
 *
 * This module is intentionally orchestration-only; heavier logic lives in dedicated helpers:
 * - sandboxState* modules for pure computations
 * - controller hooks for actions by concern
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

  const { warning, emitWarning, clearWarning } = useSandboxWarnings();

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

    clearWarning();
    setPersistEnabled(false);
    setEdgeRouting('straight');
    setLastInsertedElementIds([]);

    setAddRelatedDepth(1);
    setAddRelatedDirection('both');
    setAddRelatedEnabledTypes([]);
  }, [clearWarning, modelId]);

  const { setPersistEnabledSafe } = useSandboxPersistenceController({
    model,
    modelId,
    maxNodes,
    emitWarning,
    persistEnabled,
    setPersistEnabled,
    nodes,
    setNodes,
    setLastInsertedElementIds,

    showRelationships,
    relationshipMode,
    enabledRelationshipTypes,
    explicitRelationshipIds,
    setShowRelationships,
    setRelationshipMode,
    setEnabledRelationshipTypes,
    setExplicitRelationshipIds,

    addRelatedDepth,
    addRelatedDirection,
    addRelatedEnabledTypes,
    setAddRelatedDepth,
    setAddRelatedDirection,
    setAddRelatedEnabledTypes,

    edgeRouting,
    setEdgeRouting,
  });

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

  const setAddRelatedDepthSafe = useCallback((depth: number) => {
    setAddRelatedDepth(clampInt(depth, 1, 6));
  }, []);

  const setAddRelatedEnabledTypesSafe = useCallback((types: string[]) => {
    const uniq = Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
    setAddRelatedEnabledTypes(uniq);
  }, []);

  const toggleEnabledRelationshipType = useCallback((type: string) => {
    setEnabledRelationshipTypes((prev) => toggleString(prev, type).sort((a, b) => a.localeCompare(b)));
  }, []);

  const toggleAddRelatedEnabledType = useCallback((type: string) => {
    setAddRelatedEnabledTypes((prev) => toggleString(prev, type).sort((a, b) => a.localeCompare(b)));
  }, []);

  const basics = useSandboxBasicsActions({
    model,
    maxNodes,
    emitWarning,
    clearWarning,
    setNodes,
    setLastInsertedElementIds,
    lastInsertedElementIds,
  });

  const seeding = useSandboxSeedingActions({
    model,
    maxNodes,
    emitWarning,
    setNodes,
    setLastInsertedElementIds,
    showRelationships,
    relationshipMode,
    enabledRelationshipTypes,
    explicitRelationshipIds,
    setShowRelationships,
    setRelationshipMode,
    setEnabledRelationshipTypes,
    setExplicitRelationshipIds,
  });

  const graphActions = useSandboxGraphActions({
    model,
    maxNodes,
    emitWarning,
    addRelatedDepth,
    addRelatedDirection,
    addRelatedEnabledTypes,
    setNodes,
    setLastInsertedElementIds,
  });

  useSandboxAutoSeedFromSelection({
    mode,
    model,
    nodesLength: nodes.length,
    selectionElementIds,
    addIfMissing: (elementId) => basics.addIfMissing(elementId),
  });

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
    [
      addRelatedDepth,
      addRelatedDirection,
      addRelatedEnabledTypes,
      edgeRouting,
      enabledRelationshipTypes,
      explicitRelationshipIds,
      lastInsertedElementIds,
      maxEdges,
      maxNodes,
      nodes,
      persistEnabled,
      relationshipMode,
      showRelationships,
      warning,
    ]
  );

  const actions: SandboxActions = useMemo(
    () => ({
      setNodePosition: basics.setNodePosition,
      addIfMissing: basics.addIfMissing,
      addManyIfMissing: basics.addManyIfMissing,
      removeMany: basics.removeMany,
      clear: basics.clear,
      undoLastInsert: basics.undoLastInsert,
      seedFromView: seeding.seedFromView,

      autoLayout: seeding.autoLayout,
      setPersistEnabled: setPersistEnabledSafe,
      setEdgeRouting,
      clearWarning,

      seedFromElements: seeding.seedFromElements,
      setShowRelationships,
      setRelationshipMode,
      setEnabledRelationshipTypes,
      setExplicitRelationshipIds,
      toggleEnabledRelationshipType,

      setAddRelatedDepth: setAddRelatedDepthSafe,
      setAddRelatedDirection,
      setAddRelatedEnabledTypes: setAddRelatedEnabledTypesSafe,
      toggleAddRelatedEnabledType,
      addRelatedFromSelection: graphActions.addRelatedFromSelection,

      insertIntermediatesBetween: graphActions.insertIntermediatesBetween,
    }),
    [
      basics.addIfMissing,
      basics.addManyIfMissing,
      basics.clear,
      basics.removeMany,
      basics.setNodePosition,
      basics.undoLastInsert,
      clearWarning,
      graphActions.addRelatedFromSelection,
      graphActions.insertIntermediatesBetween,
      seeding.autoLayout,
      seeding.seedFromElements,
      seeding.seedFromView,
      setAddRelatedDepthSafe,
      setAddRelatedEnabledTypesSafe,
      setEdgeRouting,
      setPersistEnabledSafe,
      toggleAddRelatedEnabledType,
      toggleEnabledRelationshipType,
    ]
  );

  return { state, actions } as const;
}
