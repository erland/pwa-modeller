import { useCallback } from 'react';

import type { AnalysisDirection, Model, ModelKind, RelationshipType } from '../../../domain';
import { useMatrixAxesState } from './matrix/useMatrixAxesState';
import { useMatrixComputation } from './matrix/useMatrixComputation';
import { useMatrixDraftPreferencesState } from './matrix/useMatrixDraftPreferencesState';
import { useMatrixSavedQueries } from './matrix/useMatrixSavedQueries';
export type { MatrixAxisSource, MatrixWorkspaceBuiltQuery, MatrixWorkspaceCellDialogInfo } from './matrix/types';

export type UseMatrixWorkspaceStateArgs = {
  model: Model | null;
  modelId: string;
  modelKind: ModelKind;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  selectionElementIds: string[];
};

export function useMatrixWorkspaceState({
  model,
  modelId,
  modelKind,
  direction,
  relationshipTypes,
  selectionElementIds,
}: UseMatrixWorkspaceStateArgs) {
  const axes = useMatrixAxesState({ model, modelKind, selectionElementIds });

  const draft = useMatrixDraftPreferencesState({
    model,
    modelId,
    modelKind,
    direction,
    relationshipTypes,
    axes,
  });

  const { result, cellValues, relationshipTypesForWeights } = useMatrixComputation({
    model,
    builtQuery: draft.builtQuery,
    cellMetricId: draft.prefs.cellMetricId,
    weightsByRelationshipType: draft.prefs.weightsByRelationshipType,
  });

  const savedQueries = useMatrixSavedQueries({
    modelId,
    uiQuery: draft.uiQuery,
    axesRowIds: axes.rowIds,
    axesColIds: axes.colIds,
    builtQuery: draft.builtQuery,
    result,
    applyUiQuery: draft.applyUiQuery,
    setBuiltQuery: draft.setBuiltQuery,
    bumpBuildNonce: draft.bumpBuildNonce,
  });

  const resetDraft = useCallback(() => {
    draft.resetDraftCore();

    // IMPORTANT: Keep current behavior: reset axes + clear selected preset/snapshot ids.
    savedQueries.setPresetId('');
    savedQueries.setSnapshotId('');
  }, [draft, savedQueries]);

  const state = {
    axes: {
      rowSource: axes.rowSource,
      rowElementType: axes.rowElementType,
      rowLayer: axes.rowLayer,
      rowSelectionIds: axes.rowSelectionIds,
      colSource: axes.colSource,
      colElementType: axes.colElementType,
      colLayer: axes.colLayer,
      colSelectionIds: axes.colSelectionIds,
      rowIds: axes.rowIds,
      colIds: axes.colIds,
    },
    preferences: {
      highlightMissing: draft.prefs.highlightMissing,
      heatmapEnabled: draft.prefs.heatmapEnabled,
      hideEmpty: draft.prefs.hideEmpty,
      cellMetricId: draft.prefs.cellMetricId,
      weightPresets: draft.prefs.weightPresets,
      weightPresetId: draft.prefs.weightPresetId,
      weightsByRelationshipType: draft.prefs.weightsByRelationshipType,
    },
    presets: {
      presets: savedQueries.presets,
      presetId: savedQueries.presetId,
      snapshots: savedQueries.snapshots,
      snapshotId: savedQueries.snapshotId,
    },
    build: {
      buildNonce: draft.buildNonce,
      builtQuery: draft.builtQuery,
    },
    uiQuery: draft.uiQuery,
  } as const;

  const actions = {
    axes: {
      setRowSource: axes.setRowSource,
      setRowElementType: axes.setRowElementType,
      setRowLayer: axes.setRowLayer,
      setRowSelectionIds: axes.setRowSelectionIds,
      setColSource: axes.setColSource,
      setColElementType: axes.setColElementType,
      setColLayer: axes.setColLayer,
      setColSelectionIds: axes.setColSelectionIds,
      swapAxes: axes.swapAxes,
      resetDraft,
      captureSelectionAsRows: axes.captureSelectionAsRows,
      captureSelectionAsCols: axes.captureSelectionAsCols,
    },
    build: {
      build: draft.build,
    },
    preferences: {
      setHighlightMissing: draft.prefs.setHighlightMissing,
      onToggleHighlightMissing: () => draft.prefs.setHighlightMissing((v) => !v),
      setHeatmapEnabled: draft.prefs.setHeatmapEnabled,
      setHideEmpty: draft.prefs.setHideEmpty,
      setCellMetricId: draft.prefs.setCellMetricId,
      setWeightPresetId: draft.prefs.setWeightPresetId,
      setWeightsByRelationshipType: draft.prefs.setWeightsByRelationshipType,
      onChangeRelationshipTypeWeight: draft.onChangeRelationshipTypeWeight,
      applyWeightPreset: draft.applyWeightPreset,
    },
    presets: {
      setPresetId: savedQueries.setPresetId,
      saveCurrentPreset: savedQueries.saveCurrentPreset,
      deleteSelectedPreset: savedQueries.deleteSelectedPreset,
      applySelectedPreset: savedQueries.applySelectedPreset,
      setSnapshotId: savedQueries.setSnapshotId,
      saveSnapshot: savedQueries.saveSnapshot,
      deleteSnapshot: savedQueries.deleteSnapshot,
      restoreSnapshot: savedQueries.restoreSnapshot,
      applySelectedSnapshot: savedQueries.applySelectedSnapshot,
      applyUiQuery: draft.applyUiQuery,
    },
  } as const;

  const derived = {
    canBuild: draft.canBuild,
    result,
    cellValues,
    relationshipTypesForWeights,
    selectedPreset: savedQueries.selectedPreset,
    selectedSnapshot: savedQueries.selectedSnapshot,
    isDraftDirty: draft.isDraftDirty,
  } as const;

  return { state, actions, derived } as const;
}
