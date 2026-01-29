import type { MatrixQueryPreset } from '../../../matrixPresetsStorage';

import {
  buildMatrixUiQuery,
  buildMatrixWorkspaceBuiltQuery,
  mapAnalysisDirectionToMatrixDirection,
  normalizeMatrixUiQueryForApply,
} from '../queryHelpers';

describe('matrix queryHelpers', () => {
  test('mapAnalysisDirectionToMatrixDirection maps analysis direction to matrix direction', () => {
    expect(mapAnalysisDirectionToMatrixDirection('outgoing')).toBe('rowToCol');
    expect(mapAnalysisDirectionToMatrixDirection('incoming')).toBe('colToRow');
    expect(mapAnalysisDirectionToMatrixDirection('both')).toBe('both');
  });

  test('buildMatrixWorkspaceBuiltQuery builds a stable built query', () => {
    const built = buildMatrixWorkspaceBuiltQuery({
      rowIds: ['A'],
      colIds: ['B'],
      direction: 'incoming',
      relationshipTypes: ['Serving'],
    });

    expect(built).toEqual({
      rowIds: ['A'],
      colIds: ['B'],
      relationshipTypes: ['Serving'],
      direction: 'colToRow',
    });
  });

  test('buildMatrixUiQuery clones arrays/objects to avoid accidental mutation', () => {
    const axes = {
      rowSource: 'facet' as const,
      rowElementType: '' as const,
      rowLayer: '' as const,
      rowSelectionIds: ['A'],
      colSource: 'selection' as const,
      colElementType: 'BusinessActor' as const,
      colLayer: 'Business' as const,
      colSelectionIds: ['B'],
    };
    const prefs = {
      cellMetricId: 'matrixRelationshipCount' as const,
      heatmapEnabled: false,
      hideEmpty: false,
      highlightMissing: true,
      weightPresetId: 'default',
      weightsByRelationshipType: { Serving: 2 },
    };

    const ui = buildMatrixUiQuery({ axes, prefs, direction: 'outgoing', relationshipTypes: ['Serving'] });

    // Same values.
    expect(ui.rowSelectionIds).toEqual(['A']);
    expect(ui.colSelectionIds).toEqual(['B']);
    expect(ui.weightsByRelationshipType).toEqual({ Serving: 2 });

    // But cloned references.
    expect(ui.rowSelectionIds).not.toBe(axes.rowSelectionIds);
    expect(ui.colSelectionIds).not.toBe(axes.colSelectionIds);
    expect(ui.weightsByRelationshipType).not.toBe(prefs.weightsByRelationshipType);
  });

  test('normalizeMatrixUiQueryForApply extracts axes and only known preference fields', () => {
    const q: MatrixQueryPreset['query'] = {
      rowSource: 'facet',
      rowElementType: '',
      rowLayer: '',
      rowSelectionIds: ['A'],

      colSource: 'facet',
      colElementType: '',
      colLayer: '',
      colSelectionIds: ['B'],

      direction: 'both',
      relationshipTypes: ['Serving'],

      // Unknown metric id should be ignored
      cellMetricId: 'unknownMetricId',
      heatmapEnabled: true,
      hideEmpty: true,
      highlightMissing: false,
      weightPresetId: 'default',
      weightsByRelationshipType: { Serving: 5 },
    };

    const normalized = normalizeMatrixUiQueryForApply(q);

    expect(normalized.axes.rowSelectionIds).toEqual(['A']);
    expect(normalized.axes.colSelectionIds).toEqual(['B']);

    // cellMetricId ignored because it is not one of the known ids
    expect(normalized.prefs.cellMetricId).toBeUndefined();
    expect(normalized.prefs.heatmapEnabled).toBe(true);
    expect(normalized.prefs.hideEmpty).toBe(true);
    expect(normalized.prefs.highlightMissing).toBe(false);
    expect(normalized.prefs.weightPresetId).toBe('default');
    expect(normalized.prefs.weightsByRelationshipType).toEqual({ Serving: 5 });
  });
});
