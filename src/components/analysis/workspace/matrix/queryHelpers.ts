import type { AnalysisDirection, ElementType, MatrixMetricId, RelationshipType } from '../../../../domain';
import type { RelationshipMatrixDirection } from '../../../../domain/analysis/relationshipMatrix';

import type { MatrixQueryPreset } from '../../matrixPresetsStorage';
import type { MatrixAxisSource, MatrixWorkspaceBuiltQuery } from './types';

export type MatrixAxesUiState = {
  rowSource: MatrixAxisSource;
  rowElementType: ElementType | '';
  rowLayer: string | '';
  rowSelectionIds: string[];

  colSource: MatrixAxisSource;
  colElementType: ElementType | '';
  colLayer: string | '';
  colSelectionIds: string[];
};

export type MatrixPreferencesUiState = {
  cellMetricId: 'off' | MatrixMetricId;
  heatmapEnabled: boolean;
  hideEmpty: boolean;
  highlightMissing: boolean;
  weightPresetId: string;
  weightsByRelationshipType: Record<string, number>;
};

export function mapAnalysisDirectionToMatrixDirection(direction: AnalysisDirection): RelationshipMatrixDirection {
  return direction === 'outgoing' ? 'rowToCol' : direction === 'incoming' ? 'colToRow' : 'both';
}

export function buildMatrixUiQuery(args: {
  axes: MatrixAxesUiState;
  prefs: MatrixPreferencesUiState;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
}): MatrixQueryPreset['query'] {
  const { axes, prefs, direction, relationshipTypes } = args;
  return {
    rowSource: axes.rowSource,
    rowElementType: axes.rowElementType,
    rowLayer: axes.rowLayer,
    rowSelectionIds: [...axes.rowSelectionIds],

    colSource: axes.colSource,
    colElementType: axes.colElementType,
    colLayer: axes.colLayer,
    colSelectionIds: [...axes.colSelectionIds],

    direction,
    relationshipTypes,

    cellMetricId: prefs.cellMetricId,
    heatmapEnabled: prefs.heatmapEnabled,
    hideEmpty: prefs.hideEmpty,
    highlightMissing: prefs.highlightMissing,
    weightPresetId: prefs.weightPresetId,
    weightsByRelationshipType: { ...prefs.weightsByRelationshipType },
  };
}

export function buildMatrixWorkspaceBuiltQuery(args: {
  rowIds: string[];
  colIds: string[];
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
}): MatrixWorkspaceBuiltQuery {
  const { rowIds, colIds, direction, relationshipTypes } = args;
  return {
    rowIds,
    colIds,
    relationshipTypes,
    direction: mapAnalysisDirectionToMatrixDirection(direction),
  };
}

export function normalizeMatrixUiQueryForApply(
  query: MatrixQueryPreset['query']
): {
  axes: MatrixAxesUiState;
  prefs: Partial<MatrixPreferencesUiState>;
} {
  const axes: MatrixAxesUiState = {
    rowSource: query.rowSource,
    rowElementType: (query.rowElementType as ElementType | '') ?? '',
    rowLayer: query.rowLayer ?? '',
    rowSelectionIds: Array.isArray(query.rowSelectionIds) ? [...query.rowSelectionIds] : [],

    colSource: query.colSource,
    colElementType: (query.colElementType as ElementType | '') ?? '',
    colLayer: query.colLayer ?? '',
    colSelectionIds: Array.isArray(query.colSelectionIds) ? [...query.colSelectionIds] : [],
  };

  const prefs: Partial<MatrixPreferencesUiState> = {};

  // Backwards compatible: only accept known metric ids.
  if (
    query.cellMetricId &&
    (query.cellMetricId === 'off' ||
      query.cellMetricId === 'matrixRelationshipCount' ||
      query.cellMetricId === 'matrixWeightedCount')
  ) {
    prefs.cellMetricId = query.cellMetricId as 'off' | MatrixMetricId;
  }
  if (typeof query.heatmapEnabled === 'boolean') prefs.heatmapEnabled = query.heatmapEnabled;
  if (typeof query.hideEmpty === 'boolean') prefs.hideEmpty = query.hideEmpty;
  if (typeof query.highlightMissing === 'boolean') prefs.highlightMissing = query.highlightMissing;
  if (typeof query.weightPresetId === 'string') prefs.weightPresetId = query.weightPresetId;
  if (query.weightsByRelationshipType && typeof query.weightsByRelationshipType === 'object') {
    prefs.weightsByRelationshipType = { ...query.weightsByRelationshipType };
  }

  return { axes, prefs };
}
