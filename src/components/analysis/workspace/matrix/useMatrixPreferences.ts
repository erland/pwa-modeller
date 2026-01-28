import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MatrixMetricId, ModelKind } from '../../../../domain';
import { loadAnalysisUiState, mergeAnalysisUiState } from '../../analysisUiStateStorage';

export function useMatrixPreferences(args: {
  modelId: string;
  modelKind: ModelKind;
}) {
  const { modelId, modelKind } = args;

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

  useEffect(() => {
    if (!modelId) return;
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
      if (typeof ui.matrix.weightPresetId === 'string') applyWeightPreset(ui.matrix.weightPresetId);
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

  return {
    highlightMissing,
    setHighlightMissing,
    heatmapEnabled,
    setHeatmapEnabled,
    hideEmpty,
    setHideEmpty,
    cellMetricId,
    setCellMetricId,

    weightPresets,
    weightPresetId,
    setWeightPresetId,
    weightsByRelationshipType,
    setWeightsByRelationshipType,
    applyWeightPreset,
  };
}
