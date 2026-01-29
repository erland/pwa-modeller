import { useCallback, useMemo, useState } from 'react';

import type { AnalysisDirection, Model, ModelKind, RelationshipType } from '../../../domain';
import type { MatrixQueryPreset } from '../matrixPresetsStorage';

import { useMatrixAxes } from './matrix/useMatrixAxes';
import { useMatrixComputation } from './matrix/useMatrixComputation';
import { useMatrixPreferences } from './matrix/useMatrixPreferences';
import { useMatrixSavedQueries } from './matrix/useMatrixSavedQueries';
import { buildMatrixUiQuery, buildMatrixWorkspaceBuiltQuery, normalizeMatrixUiQueryForApply } from './matrix/queryHelpers';
import type { MatrixWorkspaceBuiltQuery } from './matrix/types';

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
  const axes = useMatrixAxes({ model, modelKind });
  const prefs = useMatrixPreferences({ modelId, modelKind });

  const [buildNonce, setBuildNonce] = useState<number>(0);
  const [builtQuery, setBuiltQuery] = useState<MatrixWorkspaceBuiltQuery | null>(null);

  const { result, cellValues, relationshipTypesForWeights } = useMatrixComputation({
    model,
    builtQuery,
    cellMetricId: prefs.cellMetricId,
    weightsByRelationshipType: prefs.weightsByRelationshipType,
  });

  const uiQuery = useMemo(() => {
    return buildMatrixUiQuery({
      axes: {
        rowSource: axes.rowSource,
        rowElementType: axes.rowElementType,
        rowLayer: axes.rowLayer,
        rowSelectionIds: axes.rowSelectionIds,
        colSource: axes.colSource,
        colElementType: axes.colElementType,
        colLayer: axes.colLayer,
        colSelectionIds: axes.colSelectionIds,
      },
      prefs: {
        cellMetricId: prefs.cellMetricId,
        heatmapEnabled: prefs.heatmapEnabled,
        hideEmpty: prefs.hideEmpty,
        highlightMissing: prefs.highlightMissing,
        weightPresetId: prefs.weightPresetId,
        weightsByRelationshipType: prefs.weightsByRelationshipType,
      },
      direction,
      relationshipTypes,
    });
  }, [
    axes.colElementType,
    axes.colLayer,
    axes.colSelectionIds,
    axes.colSource,
    axes.rowElementType,
    axes.rowLayer,
    axes.rowSelectionIds,
    axes.rowSource,
    direction,
    relationshipTypes,
    prefs.cellMetricId,
    prefs.heatmapEnabled,
    prefs.hideEmpty,
    prefs.highlightMissing,
    prefs.weightPresetId,
    prefs.weightsByRelationshipType,
  ]);

  const applyUiQuery = useCallback(
    (query: MatrixQueryPreset['query']): void => {
      const normalized = normalizeMatrixUiQueryForApply(query);

      axes.setRowSource(normalized.axes.rowSource);
      axes.setRowElementType(normalized.axes.rowElementType);
      axes.setRowLayer(normalized.axes.rowLayer);
      axes.setRowSelectionIds([...normalized.axes.rowSelectionIds]);

      axes.setColSource(normalized.axes.colSource);
      axes.setColElementType(normalized.axes.colElementType);
      axes.setColLayer(normalized.axes.colLayer);
      axes.setColSelectionIds([...normalized.axes.colSelectionIds]);

      if (normalized.prefs.cellMetricId) prefs.setCellMetricId(normalized.prefs.cellMetricId);
      if (typeof normalized.prefs.heatmapEnabled === 'boolean') prefs.setHeatmapEnabled(normalized.prefs.heatmapEnabled);
      if (typeof normalized.prefs.hideEmpty === 'boolean') prefs.setHideEmpty(normalized.prefs.hideEmpty);
      if (typeof normalized.prefs.highlightMissing === 'boolean')
        prefs.setHighlightMissing(normalized.prefs.highlightMissing);
      if (typeof normalized.prefs.weightPresetId === 'string') prefs.applyWeightPreset(normalized.prefs.weightPresetId);
      if (normalized.prefs.weightsByRelationshipType && typeof normalized.prefs.weightsByRelationshipType === 'object') {
        prefs.setWeightsByRelationshipType(normalized.prefs.weightsByRelationshipType);
      }
    },
    [axes, prefs]
  );

  const bumpBuildNonce = useCallback(() => {
    setBuildNonce((n) => n + 1);
  }, []);

  const savedQueries = useMatrixSavedQueries({
    modelId,
    uiQuery,
    axesRowIds: axes.rowIds,
    axesColIds: axes.colIds,
    builtQuery,
    result,
    applyUiQuery,
    setBuiltQuery,
    bumpBuildNonce,
  });

  const resetDraft = useCallback(() => {
    axes.setRowSource('facet');
    axes.setRowElementType('');
    axes.setRowLayer('');
    axes.setRowSelectionIds([]);

    axes.setColSource('facet');
    axes.setColElementType('');
    axes.setColLayer('');
    axes.setColSelectionIds([]);

    savedQueries.setPresetId('');
    savedQueries.setSnapshotId('');
  }, [axes, savedQueries]);

  const captureSelectionAsRows = useCallback(() => {
    axes.setRowSource('selection');
    axes.setRowSelectionIds([...selectionElementIds]);
  }, [axes, selectionElementIds]);

  const captureSelectionAsCols = useCallback(() => {
    axes.setColSource('selection');
    axes.setColSelectionIds([...selectionElementIds]);
  }, [axes, selectionElementIds]);

  const onChangeRelationshipTypeWeight = useCallback(
    (relationshipType: string, weight: number) => {
      prefs.setWeightsByRelationshipType((prev) => ({ ...prev, [relationshipType]: weight }));
    },
    [prefs]
  );

  const applyWeightPreset = useCallback(
    (presetId: string) => {
      prefs.applyWeightPreset(presetId);
    },
    [prefs]
  );

  const build = useCallback(() => {
    const q: MatrixWorkspaceBuiltQuery = buildMatrixWorkspaceBuiltQuery({
      rowIds: axes.rowIds,
      colIds: axes.colIds,
      direction,
      relationshipTypes,
    });
    setBuiltQuery(q);
    setBuildNonce((n) => n + 1);
  }, [axes.colIds, axes.rowIds, direction, relationshipTypes]);

  const canBuild = useMemo(() => {
    if (!model) return false;
    if (!axes.rowIds.length) return false;
    if (!axes.colIds.length) return false;
    return true;
  }, [axes.colIds.length, axes.rowIds.length, model]);

  const swapAxes = useCallback(() => {
    const nextRowSource = axes.colSource;
    const nextColSource = axes.rowSource;

    const nextRowElementType = axes.colElementType;
    const nextColElementType = axes.rowElementType;

    const nextRowLayer = axes.colLayer;
    const nextColLayer = axes.rowLayer;

    const nextRowSelectionIds = axes.colSelectionIds;
    const nextColSelectionIds = axes.rowSelectionIds;

    axes.setRowSource(nextRowSource);
    axes.setRowElementType(nextRowElementType);
    axes.setRowLayer(nextRowLayer);
    axes.setRowSelectionIds([...nextRowSelectionIds]);

    axes.setColSource(nextColSource);
    axes.setColElementType(nextColElementType);
    axes.setColLayer(nextColLayer);
    axes.setColSelectionIds([...nextColSelectionIds]);
  }, [axes]);

  const legacy = {
    // Axes state
    rowSource: axes.rowSource,
    setRowSource: axes.setRowSource,
    rowElementType: axes.rowElementType,
    setRowElementType: axes.setRowElementType,
    rowLayer: axes.rowLayer,
    setRowLayer: axes.setRowLayer,
    rowSelectionIds: axes.rowSelectionIds,
    setRowSelectionIds: axes.setRowSelectionIds,

    colSource: axes.colSource,
    setColSource: axes.setColSource,
    colElementType: axes.colElementType,
    setColElementType: axes.setColElementType,
    colLayer: axes.colLayer,
    setColLayer: axes.setColLayer,
    colSelectionIds: axes.colSelectionIds,
    setColSelectionIds: axes.setColSelectionIds,

    rowIds: axes.rowIds,
    colIds: axes.colIds,
    swapAxes,

    resetDraft,
    captureSelectionAsRows,
    captureSelectionAsCols,

    // Build + results
    buildNonce,
    builtQuery,
    build,
    canBuild,
    result,
    cellValues,
    relationshipTypesForWeights,

    // Preferences
    highlightMissing: prefs.highlightMissing,
    setHighlightMissing: prefs.setHighlightMissing,
    onToggleHighlightMissing: () => prefs.setHighlightMissing((v) => !v),

    heatmapEnabled: prefs.heatmapEnabled,
    setHeatmapEnabled: prefs.setHeatmapEnabled,

    hideEmpty: prefs.hideEmpty,
    setHideEmpty: prefs.setHideEmpty,

    cellMetricId: prefs.cellMetricId,
    setCellMetricId: prefs.setCellMetricId,

    weightPresets: prefs.weightPresets,
    weightPresetId: prefs.weightPresetId,
    setWeightPresetId: prefs.setWeightPresetId,
    weightsByRelationshipType: prefs.weightsByRelationshipType,
    setWeightsByRelationshipType: prefs.setWeightsByRelationshipType,
    onChangeRelationshipTypeWeight,

    // Presets/snapshots
    presets: savedQueries.presets,
    presetId: savedQueries.presetId,
    setPresetId: savedQueries.setPresetId,
    snapshots: savedQueries.snapshots,
    snapshotId: savedQueries.snapshotId,
    setSnapshotId: savedQueries.setSnapshotId,

    uiQuery,
    applyUiQuery,
    restoreSnapshot: savedQueries.restoreSnapshot,
    deleteSnapshot: savedQueries.deleteSnapshot,
    applyWeightPreset,

    saveCurrentPreset: savedQueries.saveCurrentPreset,
    deleteSelectedPreset: savedQueries.deleteSelectedPreset,

    saveSnapshot: savedQueries.saveSnapshot,

    applySelectedPreset: savedQueries.applySelectedPreset,
    applySelectedSnapshot: savedQueries.applySelectedSnapshot,
  } as const;

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
      highlightMissing: prefs.highlightMissing,
      heatmapEnabled: prefs.heatmapEnabled,
      hideEmpty: prefs.hideEmpty,
      cellMetricId: prefs.cellMetricId,
      weightPresets: prefs.weightPresets,
      weightPresetId: prefs.weightPresetId,
      weightsByRelationshipType: prefs.weightsByRelationshipType,
    },
    presets: {
      presets: savedQueries.presets,
      presetId: savedQueries.presetId,
      snapshots: savedQueries.snapshots,
      snapshotId: savedQueries.snapshotId,
    },
    build: {
      buildNonce,
      builtQuery,
    },
    uiQuery,
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
      swapAxes,
      resetDraft,
      captureSelectionAsRows,
      captureSelectionAsCols,
    },
    build: {
      build,
    },
    preferences: {
      setHighlightMissing: prefs.setHighlightMissing,
      onToggleHighlightMissing: () => prefs.setHighlightMissing((v) => !v),
      setHeatmapEnabled: prefs.setHeatmapEnabled,
      setHideEmpty: prefs.setHideEmpty,
      setCellMetricId: prefs.setCellMetricId,
      setWeightPresetId: prefs.setWeightPresetId,
      setWeightsByRelationshipType: prefs.setWeightsByRelationshipType,
      onChangeRelationshipTypeWeight,
      applyWeightPreset,
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
      applyUiQuery,
    },
  } as const;

  const derived = {
    canBuild,
    result,
    cellValues,
    relationshipTypesForWeights,
    selectedPreset: savedQueries.selectedPreset,
    selectedSnapshot: savedQueries.selectedSnapshot,
  } as const;

  return { state, actions, derived, legacy } as const;
}
