import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ModelKind } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { PathsBetweenQueryMode } from '../../../store';
import { useModelStore } from '../../../store';

import type { AnalysisMode } from '../AnalysisQueryPanel';
import { useMatrixModeIntegration } from './controller/useMatrixModeIntegration';
import { useAnalysisGlobalFiltersState } from './controller/useAnalysisGlobalFiltersState';
import { useAnalysisDraftActiveIdsState } from './controller/useAnalysisDraftActiveIdsState';
import { useSelectionPrefillSync } from './controller/useSelectionPrefillSync';
import { useAnalysisResultsState } from './controller/useAnalysisResultsState';
import { useQueryPanelAdapter } from './controller/useQueryPanelAdapter';
import { useSandboxState } from './controller/useSandboxState';

import {
  computeCanRun,
  computeTraceSeedId,
  selectionToElementId,
  selectionToElementIds,
} from './analysisWorkspaceUtils';

export function useAnalysisWorkspaceController({
  modelKind,
  selection,
}: {
  modelKind: ModelKind;
  selection: Selection;
}) {
  const model = useModelStore((s) => s.model);
  const modelId = model?.id ?? '';

  const [mode, setMode] = useState<AnalysisMode>('related');

  // Opt-in: allow choosing between shortest-only paths and k-shortest (Yen) paths.
  // Not currently exposed in the UI; we thread it through state so we can toggle
  // it in code or wire it up later.
  const [pathsMode, setPathsMode] = useState<PathsBetweenQueryMode>('shortest');

  // -----------------------------
  // Global filters (draft)
  // -----------------------------
  const { state: filters, actions: filterActions } = useAnalysisGlobalFiltersState(mode);
  const { direction, relationshipTypes, layers, elementTypes, maxDepth, includeStart, maxPaths, maxPathLength } = filters;
  const {
    setDirection,
    setRelationshipTypes,
    setLayers,
    setElementTypes,
    setMaxDepth,
    setIncludeStart,
    setMaxPaths,
    setMaxPathLength,
  } = filterActions;

  // -----------------------------
  // Draft + active element ids
  // -----------------------------
  const ids = useAnalysisDraftActiveIdsState();
  const draftStartId = ids.draft.startId;
  const draftSourceId = ids.draft.sourceId;
  const draftTargetId = ids.draft.targetId;

  const activeStartId = ids.active.startId;
  const activeSourceId = ids.active.sourceId;
  const activeTargetId = ids.active.targetId;

  const setDraftTargetId = ids.actions.setDraftTargetId;
  const setDraftStartIdRaw = ids.actions.setDraftStartId;
  const setActiveStartId = ids.actions.setActiveStartId;
  const setActiveSourceId = ids.actions.setActiveSourceId;
  const setActiveTargetId = ids.actions.setActiveTargetId;

  // Preferred setters that keep Start/Source aligned.
  const onChangeDraftStartIdSync = ids.actions.setDraftStartIdSync;
  const onChangeDraftSourceIdSync = ids.actions.setDraftSourceIdSync;

  const selectedElementId = useMemo(() => selectionToElementId(selection), [selection]);

  useSelectionPrefillSync({
    mode,
    selectedElementId,
    draftStartId,
    draftSourceId,
    draftTargetId,
    setDraftStartIdSync: onChangeDraftStartIdSync,
    setDraftSourceIdSync: onChangeDraftSourceIdSync,
    setDraftTargetId,
  });

  const { relatedResult, pathsResult } = useAnalysisResultsState({
    activeStartId,
    activeSourceId,
    activeTargetId,
    direction,
    relationshipTypes,
    layers,
    elementTypes,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength,
    pathsMode,
  });

  const selectionElementIds = useMemo(() => selectionToElementIds(selection), [selection]);

  // -----------------------------
  // Sandbox state (local analysis canvas)
  // -----------------------------
  const sandbox = useSandboxState({ model, modelId, mode, selectionElementIds });

  // -----------------------------
  // Matrix workspace state (draft + persisted UI options + presets/snapshots)
  // -----------------------------
  const matrix = useMatrixModeIntegration({
    model,
    modelId,
    modelKind,
    direction,
    relationshipTypes,
    selectionElementIds,
  });

  const matrixState = matrix.state;
  const matrixActions = matrix.actions;
  const matrixDerived = matrix.derived;

  const buildMatrix = matrixActions.build.build;

  const canRun = computeCanRun({
    modelPresent: Boolean(model),
    mode,
    matrixResolvedRowCount: matrixState.axes.rowIds.length,
    matrixResolvedColCount: matrixState.axes.colIds.length,
    draftStartId,
    draftSourceId,
    draftTargetId,
  });

  const run = useCallback(() => {
    if (!model) return;
    if (mode === 'matrix') {
      buildMatrix();
      return;
    }
    if (mode !== 'paths') {
      setActiveStartId(draftStartId);
      return;
    }
    setActiveSourceId(draftSourceId);
    setActiveTargetId(draftTargetId);
    // Keep related/traceability baseline aligned with the chosen source.
    setActiveStartId(draftSourceId);
  }, [buildMatrix, draftSourceId, draftStartId, draftTargetId, model, mode, setActiveSourceId, setActiveStartId, setActiveTargetId]);

// Auto-run analyses when the draft selection is sufficient.
// This avoids an extra "Run analysis" click for common workflows.
// Matrix mode is intentionally excluded for now to avoid triggering expensive builds
// while the user is still configuring axes/prefs.
useEffect(() => {
  if (!model) return;
  if (!canRun) return;

  if (mode === 'matrix') return;

  if (mode === 'paths') {
    const changed = activeSourceId !== draftSourceId || activeTargetId !== draftTargetId;
    if (changed) run();
    return;
  }

  // related / traceability
  if (activeStartId !== draftStartId) run();
}, [activeSourceId, activeStartId, activeTargetId, canRun, draftSourceId, draftStartId, draftTargetId, model, mode, run]);



  const applyPreset = useCallback(
    (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => {
      if (presetId === 'clear') {
        setDirection('both');
        setRelationshipTypes([]);
        setLayers([]);
        setElementTypes([]);
        setMaxDepth(4);
        setIncludeStart(false);
        setMaxPaths(10);
        setMaxPathLength(null);
        setPathsMode('shortest');
        matrixActions.axes.resetDraft();
        return;
      }

      if (presetId === 'upstream') {
        setDirection('incoming');
        setMaxDepth(3);
        setMaxPaths(10);
        setMaxPathLength(null);
        return;
      }

      if (presetId === 'downstream') {
        setDirection('outgoing');
        setMaxDepth(3);
        setMaxPaths(10);
        setMaxPathLength(null);
        return;
      }

      // crossLayerTrace: Business → Application → Technology
      setDirection('both');
      setMaxDepth(4);
      setLayers(['Business', 'Application', 'Technology']);
      setElementTypes([]);
      setRelationshipTypes(['Realization', 'Serving', 'Assignment', 'Access', 'Flow', 'Association']);
      setMaxPaths(10);
      setMaxPathLength(null);
    },
    [matrixActions.axes, setDirection, setRelationshipTypes, setLayers, setElementTypes, setMaxDepth, setIncludeStart, setMaxPaths, setMaxPathLength, setPathsMode]
  );

  const useSelectionAs = useCallback(
    (which: 'start' | 'source' | 'target') => {
      if (!selectedElementId) return;
      if (which === 'start') onChangeDraftStartIdSync(selectedElementId);
      if (which === 'source') onChangeDraftSourceIdSync(selectedElementId);
      if (which === 'target') setDraftTargetId(selectedElementId);
    },
    [onChangeDraftSourceIdSync, onChangeDraftStartIdSync, selectedElementId, setDraftTargetId]
  );

  const openTraceabilityFrom = useCallback(
    (elementId: string) => {
      setMode('traceability');
      // Preserve legacy behavior: set only the Start id (not Source).
      setDraftStartIdRaw(elementId);
      setActiveStartId(elementId);
    },
    [setActiveStartId, setDraftStartIdRaw, setMode]
  );

  const traceSeedId = useMemo(
    () => computeTraceSeedId({ activeStartId, draftStartId, selection }),
    [activeStartId, draftStartId, selection]
  );

  const canOpenTraceability = Boolean(selectedElementId);
  const openTraceabilityFromSelection = useCallback(() => {
    if (selectedElementId) openTraceabilityFrom(selectedElementId);
  }, [openTraceabilityFrom, selectedElementId]);

  const queryPanel = useQueryPanelAdapter({
    mode,
    setMode,
    selectionElementIds,
    draft: {
      startId: draftStartId,
      sourceId: draftSourceId,
      targetId: draftTargetId,
      setStartId: onChangeDraftStartIdSync,
      setSourceId: onChangeDraftSourceIdSync,
      setTargetId: setDraftTargetId,
      useSelection: useSelectionAs,
    },
    filters: {
      direction,
      relationshipTypes,
      layers,
      elementTypes,
      maxDepth,
      includeStart,
      maxPaths,
      maxPathLength,
      // Not currently shown in UI (opt-in)
      pathsMode,
      setDirection,
      setRelationshipTypes,
      setLayers,
      setElementTypes,
      setMaxDepth,
      setIncludeStart,
      setMaxPaths,
      setMaxPathLength,
      setPathsMode,
      applyPreset,
    },
    matrix: {
      state: matrixState,
      actions: matrixActions,
      derived: matrixDerived,
    },
    canRun,
    canUseSelection: canOpenTraceability,
    run,
  });

  return {
    state: {
      model,
      modelId,
      mode,
      direction,
      relationshipTypes,
      layers,
      elementTypes,
      maxDepth,
      includeStart,
      maxPaths,
      maxPathLength,
      pathsMode,
      draftStartId,
      draftSourceId,
      draftTargetId,
    },
    actions: {
      setMode,
      setDirection,
      setRelationshipTypes,
      setLayers,
      setElementTypes,
      setMaxDepth,
      setIncludeStart,
      setMaxPaths,
      setMaxPathLength,
      setPathsMode,
      onChangeDraftStartId: onChangeDraftStartIdSync,
      onChangeDraftSourceId: onChangeDraftSourceIdSync,
      onChangeDraftTargetId: setDraftTargetId,
      run,
      applyPreset,
      useSelectionAs,
      openTraceabilityFrom,
    },
    derived: {
      selectionElementIds,
      canRun,
      canOpenTraceability,
      openTraceabilityFromSelection,
      relatedResult,
      pathsResult,
      traceSeedId,
      sandbox: {
        state: sandbox.state,
        actions: sandbox.actions,
      },
      matrix: {
        state: matrixState,
        actions: matrixActions,
        derived: matrixDerived,
        uiQuery: matrix.uiQuery,
      },
      queryPanel: {
        state: queryPanel.state,
        actions: queryPanel.actions,
        meta: queryPanel.meta,
      },
    },
  } as const;
}
