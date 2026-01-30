import { useCallback, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, Model, ModelKind, RelationshipType } from '../../../../domain';
import type { MatrixQueryPreset } from '../../matrixPresetsStorage';

import { buildMatrixUiQuery, buildMatrixWorkspaceBuiltQuery, normalizeMatrixUiQueryForApply } from './queryHelpers';
import type { MatrixAxisSource, MatrixWorkspaceBuiltQuery } from './types';
import { useMatrixPreferences } from './useMatrixPreferences';

export type UseMatrixDraftPreferencesStateArgs = {
  model: Model | null;
  modelId: string;
  modelKind: ModelKind;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  axes: {
    // Draft axes state + setters
    rowSource: MatrixAxisSource;
    setRowSource: (v: MatrixAxisSource) => void;
    rowElementType: ElementType | '';
    setRowElementType: (v: ElementType | '') => void;
    rowLayer: string | '';
    setRowLayer: (v: string | '') => void;
    rowSelectionIds: string[];
    setRowSelectionIds: (v: string[]) => void;

    colSource: MatrixAxisSource;
    setColSource: (v: MatrixAxisSource) => void;
    colElementType: ElementType | '';
    setColElementType: (v: ElementType | '') => void;
    colLayer: string | '';
    setColLayer: (v: string | '') => void;
    colSelectionIds: string[];
    setColSelectionIds: (v: string[]) => void;

    // Derived ids
    rowIds: string[];
    colIds: string[];

    // Axes-only reset (draft fields)
    resetAxesDraft: () => void;
  };
};

export function useMatrixDraftPreferencesState(args: UseMatrixDraftPreferencesStateArgs) {
  const { model, modelId, modelKind, direction, relationshipTypes, axes } = args;

  const prefs = useMatrixPreferences({ modelId, modelKind });

  const [buildNonce, setBuildNonce] = useState<number>(0);
  const [builtQuery, setBuiltQuery] = useState<MatrixWorkspaceBuiltQuery | null>(null);

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
      if (typeof normalized.prefs.highlightMissing === 'boolean') prefs.setHighlightMissing(normalized.prefs.highlightMissing);
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

  const resetDraftCore = useCallback(() => {
    // IMPORTANT: only resets draft axes state; keeps persisted preferences unchanged (preserves current behavior).
    axes.resetAxesDraft();
  }, [axes]);

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
  // Optional: useful during refactor/migration; currently not consumed by UI.
  const isDraftDirty = useMemo(() => {
    if (!builtQuery) return false;
    const sig = (q: MatrixWorkspaceBuiltQuery) =>
      `${q.direction}|${q.relationshipTypes.join(',')}|${q.rowIds.join(',')}|${q.colIds.join(',')}`;
    const currentSig = sig(
      buildMatrixWorkspaceBuiltQuery({
        rowIds: axes.rowIds,
        colIds: axes.colIds,
        direction,
        relationshipTypes,
      })
    );
    return sig(builtQuery) !== currentSig;
  }, [axes.colIds, axes.rowIds, builtQuery, direction, relationshipTypes]);

  return {
    prefs,
    uiQuery,
    applyUiQuery,

    buildNonce,
    builtQuery,
    setBuiltQuery,
    bumpBuildNonce,

    build,
    canBuild,

    resetDraftCore,
    isDraftDirty,

    onChangeRelationshipTypeWeight,
    applyWeightPreset,
  } as const;
}
