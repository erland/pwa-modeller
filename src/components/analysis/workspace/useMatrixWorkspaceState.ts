import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, MatrixMetricId, Model, ModelKind, RelationshipType } from '../../../domain';
import { computeMatrixMetric } from '../../../domain';
import { buildRelationshipMatrix, type RelationshipMatrixDirection } from '../../../domain/analysis/relationshipMatrix';
import { getAnalysisAdapter } from '../../../analysis/adapters/registry';

import { loadAnalysisUiState, mergeAnalysisUiState } from '../analysisUiStateStorage';
import {
  loadMatrixPresets,
  loadMatrixSnapshots,
  saveMatrixPresets,
  saveMatrixSnapshots,
  type MatrixQueryPreset,
  type MatrixQuerySnapshot
} from '../matrixPresetsStorage';

export type MatrixAxisSource = 'facet' | 'selection';

export type MatrixWorkspaceBuiltQuery = {
  rowIds: string[];
  colIds: string[];
  relationshipTypes: RelationshipType[];
  direction: RelationshipMatrixDirection;
};

export type MatrixWorkspaceCellDialogInfo = {
  rowId: string;
  rowLabel: string;
  colId: string;
  colLabel: string;
  relationshipIds: string[];
};

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
  selectionElementIds
}: UseMatrixWorkspaceStateArgs) {
  const [rowSource, setRowSource] = useState<MatrixAxisSource>('facet');
  const [rowElementType, setRowElementType] = useState<ElementType | ''>('');
  const [rowLayer, setRowLayer] = useState<string | ''>('');
  const [rowSelectionIds, setRowSelectionIds] = useState<string[]>([]);

  const [colSource, setColSource] = useState<MatrixAxisSource>('facet');
  const [colElementType, setColElementType] = useState<ElementType | ''>('');
  const [colLayer, setColLayer] = useState<string | ''>('');
  const [colSelectionIds, setColSelectionIds] = useState<string[]>([]);

  const [buildNonce, setBuildNonce] = useState<number>(0);
  const [builtQuery, setBuiltQuery] = useState<MatrixWorkspaceBuiltQuery | null>(null);

  const [highlightMissing, setHighlightMissing] = useState<boolean>(true);
  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(false);
  const [hideEmpty, setHideEmpty] = useState<boolean>(false);

  const [cellMetricId, setCellMetricId] = useState<'off' | MatrixMetricId>('matrixRelationshipCount');

  const weightPresets = useMemo(() => {
    const base = [{ id: 'default', label: 'Default (all 1)' }];
    if (modelKind === 'archimate') {
      base.push({ id: 'archimateDependencies', label: 'ArchiMate: dependency emphasis' });
    }
    return base;
  }, [modelKind]);

  const [weightPresetId, setWeightPresetId] = useState<string>('default');
  const [weightsByRelationshipType, setWeightsByRelationshipType] = useState<Record<string, number>>({});

  const weightsForMatrixPreset = useCallback((presetId: string): Record<string, number> => {
    if (presetId === 'archimateDependencies') {
      return {
        Access: 3,
        Serving: 2,
        Flow: 2,
        Triggering: 2,
        Influence: 2,
        Realization: 1,
        Assignment: 1,
        Association: 1,
        Aggregation: 1,
        Composition: 1,
        Specialization: 1,
      };
    }
    return {};
  }, []);

  const applyWeightPreset = useCallback((presetId: string): void => {
    setWeightPresetId(presetId);
    setWeightsByRelationshipType(weightsForMatrixPreset(presetId));
  }, [weightsForMatrixPreset]);

  useEffect(() => {
    // When model kind changes, reset to default to avoid applying ArchiMate weights to other notations.
    applyWeightPreset('default');
  }, [applyWeightPreset, modelKind]);

  const [presets, setPresets] = useState<MatrixQueryPreset[]>([]);
  const [presetId, setPresetId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<MatrixQuerySnapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState<string>('');

  useEffect(() => {
    if (!modelId) return;
    setPresets(loadMatrixPresets(modelId));
    setSnapshots(loadMatrixSnapshots(modelId));
    setPresetId('');
    setSnapshotId('');

    const ui = loadAnalysisUiState(modelId);
    if (ui?.matrix) {
      const restoredCellMetricId = ui.matrix.cellMetricId;
      if (
        restoredCellMetricId &&
        (restoredCellMetricId === 'off' ||
          restoredCellMetricId === 'matrixRelationshipCount' ||
          restoredCellMetricId === 'matrixWeightedCount')
      ) {
        setCellMetricId(restoredCellMetricId);
      }
      if (typeof ui.matrix.heatmapEnabled === 'boolean') setHeatmapEnabled(ui.matrix.heatmapEnabled);
      if (typeof ui.matrix.hideEmpty === 'boolean') setHideEmpty(ui.matrix.hideEmpty);
      if (typeof ui.matrix.highlightMissing === 'boolean') setHighlightMissing(ui.matrix.highlightMissing);
      if (typeof ui.matrix.weightPresetId === 'string') {
        applyWeightPreset(ui.matrix.weightPresetId);
      }
      if (ui.matrix.weightsByRelationshipType && typeof ui.matrix.weightsByRelationshipType === 'object') {
        setWeightsByRelationshipType(ui.matrix.weightsByRelationshipType);
      }
    }
  }, [applyWeightPreset, modelId]);

  useEffect(() => {
    if (!modelId) return;
    mergeAnalysisUiState(modelId, {
      matrix: {
        cellMetricId,
        heatmapEnabled,
        hideEmpty,
        highlightMissing,
        weightPresetId,
        weightsByRelationshipType,
      }
    });
  }, [cellMetricId, heatmapEnabled, hideEmpty, highlightMissing, modelId, weightPresetId, weightsByRelationshipType]);

  useEffect(() => {
    if (cellMetricId === 'off' && heatmapEnabled) setHeatmapEnabled(false);
  }, [cellMetricId, heatmapEnabled]);

  const resolveFacetIds = useMemo(() => {
    if (!model) return { rowIds: [] as string[], colIds: [] as string[] };
    const adapter = getAnalysisAdapter(modelKind);
    const wantedRowLayer = rowLayer || null;
    const wantedColLayer = colLayer || null;

    const wantedRowType = rowElementType || null;
    const wantedColType = colElementType || null;

    const rowIds: string[] = [];
    const colIds: string[] = [];

    for (const el of Object.values(model.elements ?? {})) {
      if (!el?.id) continue;
      const facets = adapter.getNodeFacetValues(el, model);
      const typeV = facets.elementType;
      const layerV = facets.archimateLayer;

      const matches = (wantedType: string | null, wantedLayer: string | null): boolean => {
        if (wantedType) {
          if (typeof typeV !== 'string' || typeV !== wantedType) return false;
        }
        if (wantedLayer) {
          if (typeof layerV === 'string') {
            if (layerV !== wantedLayer) return false;
          } else if (Array.isArray(layerV)) {
            if (!layerV.includes(wantedLayer)) return false;
          } else {
            return false;
          }
        }
        return true;
      };

      if (matches(wantedRowType, wantedRowLayer)) rowIds.push(el.id);
      if (matches(wantedColType, wantedColLayer)) colIds.push(el.id);
    }

    return { rowIds, colIds };
  }, [colElementType, colLayer, model, modelKind, rowElementType, rowLayer]);

  const rowIds = rowSource === 'selection' ? rowSelectionIds : resolveFacetIds.rowIds;
  const colIds = colSource === 'selection' ? colSelectionIds : resolveFacetIds.colIds;

  const result = useMemo(() => {
    if (!model || !builtQuery) return null;
    return buildRelationshipMatrix(
      model,
      builtQuery.rowIds,
      builtQuery.colIds,
      { relationshipTypes: builtQuery.relationshipTypes, direction: builtQuery.direction },
      { includeSelf: false }
    );
  }, [builtQuery, model]);

  const cellValues = useMemo(() => {
    if (!model || !builtQuery) return undefined;
    if (cellMetricId === 'off') return undefined;

    const baseParams = {
      rowIds: builtQuery.rowIds,
      colIds: builtQuery.colIds,
      filters: {
        direction: builtQuery.direction,
        relationshipTypes: builtQuery.relationshipTypes.length ? builtQuery.relationshipTypes : undefined,
      },
      options: { includeSelf: false },
    } as const;

    if (cellMetricId === 'matrixWeightedCount') {
      return computeMatrixMetric(model, 'matrixWeightedCount', {
        ...baseParams,
        weightsByRelationshipType,
        defaultWeight: 1,
      }).values;
    }

    return computeMatrixMetric(model, cellMetricId, baseParams).values;
  }, [builtQuery, cellMetricId, model, weightsByRelationshipType]);

  const relationshipTypesForWeights = useMemo(() => {
    if (!model || !result) return [] as string[];
    const found = new Set<string>();
    for (const row of result.cells) {
      for (const cell of row) {
        for (const id of cell.relationshipIds) {
          const rel = model.relationships[id];
          if (!rel) continue;
          found.add(String(rel.type));
        }
      }
    }
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [model, result]);

  const applyUiQuery = useCallback((query: MatrixQueryPreset['query']): void => {
    setRowSource(query.rowSource);
    setRowElementType(query.rowElementType);
    setRowLayer(query.rowLayer);
    setRowSelectionIds([...query.rowSelectionIds]);

    setColSource(query.colSource);
    setColElementType(query.colElementType);
    setColLayer(query.colLayer);
    setColSelectionIds([...query.colSelectionIds]);

    // Optional metric configuration (older presets may omit these).
    if (
      query.cellMetricId &&
      (query.cellMetricId === 'off' ||
        query.cellMetricId === 'matrixRelationshipCount' ||
        query.cellMetricId === 'matrixWeightedCount')
    ) {
      setCellMetricId(query.cellMetricId);
    }
    if (typeof query.heatmapEnabled === 'boolean') setHeatmapEnabled(query.heatmapEnabled);
    if (typeof query.hideEmpty === 'boolean') setHideEmpty(query.hideEmpty);
    if (typeof query.highlightMissing === 'boolean') setHighlightMissing(query.highlightMissing);
    if (typeof query.weightPresetId === 'string') applyWeightPreset(query.weightPresetId);
    if (query.weightsByRelationshipType && typeof query.weightsByRelationshipType === 'object') {
      setWeightsByRelationshipType(query.weightsByRelationshipType);
    }
  }, [applyWeightPreset]);

  const saveCurrentPreset = useCallback((uiQuery: MatrixQueryPreset['query']): void => {
    if (!modelId) return;
    const name = window.prompt('Preset name?');
    if (!name) return;
    const preset: MatrixQueryPreset = {
      id: `preset_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      query: uiQuery
    };
    const next = [preset, ...presets].slice(0, 50);
    setPresets(next);
    setPresetId(preset.id);
    saveMatrixPresets(modelId, next);
  }, [modelId, presets]);

  const deleteSelectedPreset = useCallback((): void => {
    if (!modelId || !presetId) return;
    const preset = presets.find((p) => p.id === presetId);
    const ok = window.confirm(`Delete preset “${preset?.name ?? 'Unnamed'}”?`);
    if (!ok) return;
    const next = presets.filter((p) => p.id !== presetId);
    setPresets(next);
    setPresetId('');
    saveMatrixPresets(modelId, next);
  }, [modelId, presetId, presets]);

  const saveSnapshot = useCallback((uiQuery: MatrixQuerySnapshot['uiQuery']): void => {
    if (!modelId || !builtQuery || !result) return;
    const name = window.prompt('Snapshot name?');
    if (!name) return;

    let missingCells = 0;
    let nonZeroCells = 0;
    for (const row of result.cells) {
      for (const cell of row) {
        if (cell.count === 0) missingCells += 1;
        else nonZeroCells += 1;
      }
    }

    const snapshot: MatrixQuerySnapshot = {
      id: `snap_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      builtQuery: {
        rowIds: [...builtQuery.rowIds],
        colIds: [...builtQuery.colIds],
        direction: builtQuery.direction,
        relationshipTypes: [...builtQuery.relationshipTypes],
      },
      uiQuery,
      summary: {
        rowCount: result.rows.length,
        colCount: result.cols.length,
        grandTotal: result.grandTotal,
        missingCells,
        nonZeroCells,
      }
    };

    const next = [snapshot, ...snapshots].slice(0, 50);
    setSnapshots(next);
    saveMatrixSnapshots(modelId, next);
  }, [builtQuery, modelId, result, snapshots]);

  const restoreSnapshot = useCallback((id: string): void => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    // apply UI query is handled by the caller (it also sets direction/relationshipTypes)
    setBuiltQuery({
      rowIds: [...snap.builtQuery.rowIds],
      colIds: [...snap.builtQuery.colIds],
      relationshipTypes: [...snap.builtQuery.relationshipTypes],
      direction: snap.builtQuery.direction,
    });
    setBuildNonce((n) => n + 1);
  }, [snapshots]);

  const deleteSnapshot = useCallback((id: string): void => {
    if (!modelId) return;
    const snap = snapshots.find((s) => s.id === id);
    const ok = window.confirm(`Delete snapshot “${snap?.name ?? 'Unnamed'}”?`);
    if (!ok) return;
    const next = snapshots.filter((s) => s.id !== id);
    setSnapshots(next);
    saveMatrixSnapshots(modelId, next);
  }, [modelId, snapshots]);

  const captureSelectionAsRows = useCallback(() => {
    setRowSource('selection');
    setRowSelectionIds(selectionElementIds);
  }, [selectionElementIds]);

  const captureSelectionAsCols = useCallback(() => {
    setColSource('selection');
    setColSelectionIds(selectionElementIds);
  }, [selectionElementIds]);

  const swapAxes = useCallback(() => {
    const prevRowSource = rowSource;
    const prevRowElementType = rowElementType;
    const prevRowLayer = rowLayer;
    const prevRowSelectionIds = rowSelectionIds;

    setRowSource(colSource);
    setRowElementType(colElementType);
    setRowLayer(colLayer);
    setRowSelectionIds(colSelectionIds);

    setColSource(prevRowSource);
    setColElementType(prevRowElementType);
    setColLayer(prevRowLayer);
    setColSelectionIds(prevRowSelectionIds);

    setBuiltQuery(null);
  }, [colElementType, colLayer, colSelectionIds, colSource, rowElementType, rowLayer, rowSelectionIds, rowSource]);

  const resetDraft = useCallback(() => {
    setRowSource('facet');
    setRowElementType('');
    setRowLayer('');
    setRowSelectionIds([]);
    setColSource('facet');
    setColElementType('');
    setColLayer('');
    setColSelectionIds([]);
    setBuiltQuery(null);
    setBuildNonce(0);
  }, []);

  const build = useCallback(() => {
    const matrixDirection: RelationshipMatrixDirection =
      direction === 'outgoing' ? 'rowToCol' : direction === 'incoming' ? 'colToRow' : 'both';

    setBuiltQuery({
      rowIds: [...rowIds],
      colIds: [...colIds],
      relationshipTypes: [...relationshipTypes],
      direction: matrixDirection,
    });
    setBuildNonce((n) => n + 1);
  }, [colIds, direction, relationshipTypes, rowIds]);

  return {
    // axis draft
    rowSource, setRowSource,
    rowElementType, setRowElementType,
    rowLayer, setRowLayer,
    rowSelectionIds, setRowSelectionIds,
    colSource, setColSource,
    colElementType, setColElementType,
    colLayer, setColLayer,
    colSelectionIds, setColSelectionIds,

    // resolved sets
    rowIds,
    colIds,

    // build
    buildNonce,
    builtQuery,
    build,
    resetDraft,

    // presets/snapshots
    presets,
    presetId, setPresetId,
    saveCurrentPreset,
    deleteSelectedPreset,
    applyUiQuery,

    snapshots,
    snapshotId, setSnapshotId,
    saveSnapshot,
    restoreSnapshot,
    deleteSnapshot,

    // UI options
    highlightMissing, setHighlightMissing,
    heatmapEnabled, setHeatmapEnabled,
    hideEmpty, setHideEmpty,
    cellMetricId, setCellMetricId,

    // weights
    weightPresets,
    weightPresetId,
    applyWeightPreset,
    weightsByRelationshipType, setWeightsByRelationshipType,
    relationshipTypesForWeights,

    // computed output
    result,
    cellValues,

    // helpers
    captureSelectionAsRows,
    captureSelectionAsCols,
    swapAxes,
  };
}
