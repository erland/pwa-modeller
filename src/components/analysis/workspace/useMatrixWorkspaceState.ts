import { useCallback, useMemo, useState } from 'react';

import type { AnalysisDirection, Model, ModelKind, RelationshipType } from '../../../domain';
import type { MatrixQueryPreset } from '../matrixPresetsStorage';

import { useMatrixAxes } from './matrix/useMatrixAxes';
import { useMatrixComputation } from './matrix/useMatrixComputation';
import { useMatrixPreferences } from './matrix/useMatrixPreferences';
import { useMatrixPresets } from './matrix/useMatrixPresets';
import { buildMatrixUiQuery, buildMatrixWorkspaceBuiltQuery, normalizeMatrixUiQueryForApply, mapAnalysisDirectionToMatrixDirection } from './matrix/queryHelpers';
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
  const presetsState = useMatrixPresets({ modelId });

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

  const selectedPreset = useMemo(() => {
    if (!presetsState.presetId) return null;
    return presetsState.presets.find((p) => p.id === presetsState.presetId) ?? null;
  }, [presetsState.presetId, presetsState.presets]);

  const selectedSnapshot = useMemo(() => {
    if (!presetsState.snapshotId) return null;
    return presetsState.snapshots.find((p) => p.id === presetsState.snapshotId) ?? null;
  }, [presetsState.snapshotId, presetsState.snapshots]);

  const saveCurrentPreset = useCallback(
    (query?: MatrixQueryPreset['query']): void => {
      if (!modelId) return;
      const q = query ?? uiQuery;
      const name = window.prompt('Preset name?');
      if (!name) return;

      const preset: MatrixQueryPreset = {
        id: `preset_${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        query: q,
  };

      const next = [preset, ...presetsState.presets].slice(0, 50);
      presetsState.savePresetList(next);
      presetsState.setPresetId(preset.id);
    },
    [modelId, presetsState, uiQuery]
  );

  const deleteSelectedPreset = useCallback((): void => {
    if (!modelId || !presetsState.presetId) return;
    const preset = presetsState.presets.find((p) => p.id === presetsState.presetId);
    const ok = window.confirm(`Delete preset “${preset?.name ?? 'Unnamed'}”?`);
    if (!ok) return;
    const next = presetsState.presets.filter((p) => p.id !== presetsState.presetId);
    presetsState.savePresetList(next);
    presetsState.setPresetId('');
  }, [modelId, presetsState]);

  const computeSnapshotSummary = useCallback(() => {
    if (!result) {
      return { rowCount: 0, colCount: 0, grandTotal: 0, missingCells: 0, nonZeroCells: 0 };
    }
    let missingCells = 0;
    let nonZeroCells = 0;
    for (const row of result.cells) {
      for (const cell of row) {
        if (cell.count === 0) missingCells += 1;
        else nonZeroCells += 1;
      }
    }
    return {
      rowCount: result.rows.length,
      colCount: result.cols.length,
      grandTotal: result.grandTotal,
      missingCells,
      nonZeroCells,
    };
  }, [result]);

  const saveSnapshot = useCallback(
    (query?: MatrixQueryPreset['query']): void => {
      if (!modelId) return;
      const q = query ?? uiQuery;
      const name = window.prompt('Snapshot name?');
      if (!name) return;

      const dir = mapAnalysisDirectionToMatrixDirection(q.direction);

      const snapshot = {
        id: `snapshot_${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        builtQuery: {
          rowIds: builtQuery?.rowIds ?? axes.rowIds,
          colIds: builtQuery?.colIds ?? axes.colIds,
          direction: builtQuery?.direction ?? dir,
          relationshipTypes: builtQuery?.relationshipTypes ?? q.relationshipTypes,
        },
        uiQuery: q,
        summary: computeSnapshotSummary(),
      };

      const next = [snapshot, ...presetsState.snapshots].slice(0, 50);
      presetsState.saveSnapshotList(next);
      presetsState.setSnapshotId(snapshot.id);
    },
    [axes.colIds, axes.rowIds, builtQuery, computeSnapshotSummary, modelId, presetsState, uiQuery]
  );

  const deleteSnapshot = useCallback(
    (id: string): void => {
      if (!modelId) return;
      const snap = presetsState.snapshots.find((s) => s.id === id);
      const ok = window.confirm(`Delete snapshot “${snap?.name ?? 'Unnamed'}”?`);
      if (!ok) return;
      const next = presetsState.snapshots.filter((s) => s.id !== id);
      presetsState.saveSnapshotList(next);
      if (presetsState.snapshotId === id) presetsState.setSnapshotId('');
    },
    [modelId, presetsState]
  );

  const restoreSnapshot = useCallback(
    (id: string): void => {
      const snap = presetsState.snapshots.find((s) => s.id === id);
      if (!snap) return;
      presetsState.setSnapshotId(id);
      applyUiQuery(snap.uiQuery);
      setBuiltQuery({
        rowIds: snap.builtQuery.rowIds,
        colIds: snap.builtQuery.colIds,
        direction: snap.builtQuery.direction,
        relationshipTypes: snap.builtQuery.relationshipTypes,
      });
      setBuildNonce((n) => n + 1);
    },
    [applyUiQuery, presetsState]
  );

  const applySelectedPreset = useCallback(() => {
    if (!selectedPreset) return;
    applyUiQuery(selectedPreset.query);
  }, [applyUiQuery, selectedPreset]);

  const applySelectedSnapshot = useCallback(() => {
    if (!selectedSnapshot) return;
    restoreSnapshot(selectedSnapshot.id);
  }, [restoreSnapshot, selectedSnapshot]);

  const resetDraft = useCallback(() => {
    axes.setRowSource('facet');
    axes.setRowElementType('');
    axes.setRowLayer('');
    axes.setRowSelectionIds([]);

    axes.setColSource('facet');
    axes.setColElementType('');
    axes.setColLayer('');
    axes.setColSelectionIds([]);

    presetsState.setPresetId('');
    presetsState.setSnapshotId('');
  }, [axes, presetsState]);

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
    presets: presetsState.presets,
    presetId: presetsState.presetId,
    setPresetId: presetsState.setPresetId,
    snapshots: presetsState.snapshots,
    snapshotId: presetsState.snapshotId,
    setSnapshotId: presetsState.setSnapshotId,

    uiQuery,
    applyUiQuery,
    restoreSnapshot,
    deleteSnapshot,
    applyWeightPreset,

    saveCurrentPreset,
    deleteSelectedPreset,

    saveSnapshot,

    applySelectedPreset,
    applySelectedSnapshot,
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
      presets: presetsState.presets,
      presetId: presetsState.presetId,
      snapshots: presetsState.snapshots,
      snapshotId: presetsState.snapshotId,
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
      setPresetId: presetsState.setPresetId,
      saveCurrentPreset,
      deleteSelectedPreset,
      applySelectedPreset,
      setSnapshotId: presetsState.setSnapshotId,
      saveSnapshot,
      deleteSnapshot,
      restoreSnapshot,
      applySelectedSnapshot,
      applyUiQuery,
    },
  } as const;

  const derived = {
    canBuild,
    result,
    cellValues,
    relationshipTypesForWeights,
    selectedPreset,
    selectedSnapshot,
  } as const;

  return { state, actions, derived, legacy } as const;
}
