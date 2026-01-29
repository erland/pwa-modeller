import { useCallback, useMemo, useState } from 'react';

import type { ModelKind } from '../../../domain';
import type { Selection } from '../../model/selection';
import { useModelStore } from '../../../store';

import type { AnalysisMode } from '../AnalysisQueryPanel';
import type { AnalysisQueryPanelActions, AnalysisQueryPanelMeta, AnalysisQueryPanelState } from '../AnalysisQueryPanel';
import { useMatrixWorkspaceState } from './useMatrixWorkspaceState';
import { useAnalysisGlobalFiltersState } from './controller/useAnalysisGlobalFiltersState';
import { useAnalysisDraftActiveIdsState } from './controller/useAnalysisDraftActiveIdsState';
import { useSelectionPrefillSync } from './controller/useSelectionPrefillSync';
import { useAnalysisResultsState } from './controller/useAnalysisResultsState';

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
  });

  const selectionElementIds = useMemo(() => selectionToElementIds(selection), [selection]);

  // -----------------------------
  // Matrix workspace state (draft + persisted UI options + presets/snapshots)
  // -----------------------------
  const matrixWorkspace = useMatrixWorkspaceState({
    model,
    modelId,
    modelKind,
    direction,
    relationshipTypes,
    selectionElementIds,
  });

  const matrixState = matrixWorkspace.state;
  const matrixActions = matrixWorkspace.actions;
  const matrixDerived = matrixWorkspace.derived;

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
      matrixActions.build.build();
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
  }, [draftSourceId, draftStartId, draftTargetId, matrixActions.build, model, mode]);

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
    [matrixActions.axes]
  );

  const useSelectionAs = useCallback(
    (which: 'start' | 'source' | 'target') => {
      if (!selectedElementId) return;
      if (which === 'start') onChangeDraftStartIdSync(selectedElementId);
      if (which === 'source') onChangeDraftSourceIdSync(selectedElementId);
      if (which === 'target') setDraftTargetId(selectedElementId);
    },
    [onChangeDraftSourceIdSync, onChangeDraftStartIdSync, selectedElementId]
  );

  const openTraceabilityFrom = useCallback((elementId: string) => {
    setMode('traceability');
    // Preserve legacy behavior: set only the Start id (not Source).
    ids.actions.setDraftStartId(elementId);
    setActiveStartId(elementId);
  }, []);

  const traceSeedId = useMemo(
    () => computeTraceSeedId({ activeStartId, draftStartId, selection }),
    [activeStartId, draftStartId, selection]
  );

  const canOpenTraceability = Boolean(selectedElementId);
  const openTraceabilityFromSelection = useCallback(() => {
    if (selectedElementId) openTraceabilityFrom(selectedElementId);
  }, [openTraceabilityFrom, selectedElementId]);

  // -----------------------------
  // Query-panel adapters (reduce glue in AnalysisWorkspace)
  // -----------------------------
  const matrixUiQuery = matrixState.uiQuery;

  const applySelectedMatrixPreset = useCallback(() => {
    const p = matrixState.presets.presets.find((x) => x.id === matrixState.presets.presetId);
    if (!p) return;
    matrixActions.presets.applyUiQuery(p.query);
    setDirection(p.query.direction);
    setRelationshipTypes([...p.query.relationshipTypes]);
  }, [matrixActions.presets, matrixState.presets.presetId, matrixState.presets.presets]);

  const restoreSelectedMatrixSnapshot = useCallback(() => {
    const snap = matrixState.presets.snapshots.find((s) => s.id === matrixState.presets.snapshotId);
    if (!snap) return;
    matrixActions.presets.applyUiQuery(snap.uiQuery);
    setDirection(snap.uiQuery.direction);
    setRelationshipTypes([...snap.uiQuery.relationshipTypes]);
    matrixActions.presets.restoreSnapshot(matrixState.presets.snapshotId);
  }, [matrixActions.presets, matrixState.presets.snapshotId, matrixState.presets.snapshots]);

  const deleteSelectedMatrixSnapshot = useCallback(() => {
    const id = matrixState.presets.snapshotId;
    matrixActions.presets.setSnapshotId('');
    if (id) matrixActions.presets.deleteSnapshot(id);
  }, [matrixActions.presets, matrixState.presets.snapshotId]);

  const queryPanelState: AnalysisQueryPanelState = useMemo(
    () => ({
      mode,
      selectionElementIds,
      draft: {
        startId: draftStartId,
        sourceId: draftSourceId,
        targetId: draftTargetId,
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
      },
      matrix: {
        rowSource: matrixState.axes.rowSource,
        rowElementType: matrixState.axes.rowElementType,
        rowLayer: matrixState.axes.rowLayer,
        rowSelectionIds: matrixState.axes.rowSelectionIds,

        colSource: matrixState.axes.colSource,
        colElementType: matrixState.axes.colElementType,
        colLayer: matrixState.axes.colLayer,
        colSelectionIds: matrixState.axes.colSelectionIds,

        resolvedRowCount: matrixState.axes.rowIds.length,
        resolvedColCount: matrixState.axes.colIds.length,
        hasBuilt: Boolean(matrixState.build.builtQuery),
        buildNonce: matrixState.build.buildNonce,

        presets: matrixState.presets.presets,
        presetId: matrixState.presets.presetId,

        snapshots: matrixState.presets.snapshots,
        snapshotId: matrixState.presets.snapshotId,
        canSaveSnapshot: Boolean(matrixDerived.result),
      },
    }),
    [
      direction,
      draftSourceId,
      draftStartId,
      draftTargetId,
      elementTypes,
      includeStart,
      layers,
      matrixDerived.result,
      matrixState.axes.colElementType,
      matrixState.axes.colIds.length,
      matrixState.axes.colLayer,
      matrixState.axes.colSelectionIds,
      matrixState.axes.colSource,
      matrixState.axes.rowElementType,
      matrixState.axes.rowIds.length,
      matrixState.axes.rowLayer,
      matrixState.axes.rowSelectionIds,
      matrixState.axes.rowSource,
      matrixState.build.builtQuery,
      matrixState.build.buildNonce,
      matrixState.presets.presetId,
      matrixState.presets.presets,
      matrixState.presets.snapshotId,
      matrixState.presets.snapshots,
      maxDepth,
      maxPathLength,
      maxPaths,
      mode,
      relationshipTypes,
      selectionElementIds,
    ]
  );

  const queryPanelActions: AnalysisQueryPanelActions = useMemo(
    () => ({
      setMode,
      run,
      draft: {
        setStartId: onChangeDraftStartIdSync,
        setSourceId: onChangeDraftSourceIdSync,
        setTargetId: setDraftTargetId,
        useSelection: useSelectionAs,
      },
      filters: {
        setDirection,
        setRelationshipTypes,
        setLayers,
        setElementTypes,
        setMaxDepth,
        setIncludeStart,
        setMaxPaths,
        setMaxPathLength,
        applyPreset,
      },
      matrix: {
        setRowSource: matrixActions.axes.setRowSource,
        setRowElementType: matrixActions.axes.setRowElementType,
        setRowLayer: matrixActions.axes.setRowLayer,
        setRowSelectionIds: matrixActions.axes.setRowSelectionIds,
        captureRowSelection: matrixActions.axes.captureSelectionAsRows,

        setColSource: matrixActions.axes.setColSource,
        setColElementType: matrixActions.axes.setColElementType,
        setColLayer: matrixActions.axes.setColLayer,
        setColSelectionIds: matrixActions.axes.setColSelectionIds,
        captureColSelection: matrixActions.axes.captureSelectionAsCols,

        swapAxes: matrixActions.axes.swapAxes,

        setPresetId: matrixActions.presets.setPresetId,
        savePreset: () => matrixActions.presets.saveCurrentPreset(matrixUiQuery),
        applySelectedPreset: applySelectedMatrixPreset,
        deleteSelectedPreset: matrixActions.presets.deleteSelectedPreset,

        setSnapshotId: matrixActions.presets.setSnapshotId,
        saveSnapshot: () => matrixActions.presets.saveSnapshot(matrixUiQuery),
        restoreSelectedSnapshot: restoreSelectedMatrixSnapshot,
        deleteSelectedSnapshot: deleteSelectedMatrixSnapshot,
      },
    }),
    [
      applyPreset,
      applySelectedMatrixPreset,
      deleteSelectedMatrixSnapshot,
      matrixActions.axes,
      matrixActions.presets,
      matrixUiQuery,
      onChangeDraftSourceIdSync,
      onChangeDraftStartIdSync,
      restoreSelectedMatrixSnapshot,
      run,
      setElementTypes,
      setIncludeStart,
      setLayers,
      setMaxDepth,
      setMaxPathLength,
      setMaxPaths,
      setMode,
      setRelationshipTypes,
      useSelectionAs,
    ]
  );

  const queryPanelMeta: AnalysisQueryPanelMeta = useMemo(
    () => ({
      canRun,
      canUseSelection: canOpenTraceability,
    }),
    [canOpenTraceability, canRun]
  );

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
      matrix: {
        state: matrixState,
        actions: matrixActions,
        derived: matrixDerived,
        uiQuery: matrixUiQuery,
      },
      queryPanel: {
        state: queryPanelState,
        actions: queryPanelActions,
        meta: queryPanelMeta,
      },
    },
  } as const;
}
