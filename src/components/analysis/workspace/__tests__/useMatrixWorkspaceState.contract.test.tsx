import { act, renderHook, waitFor } from '@testing-library/react';

import { createElement, createEmptyModel } from '../../../../domain/factories';
import type { Model } from '../../../../domain/types';
import { useMatrixWorkspaceState } from '../useMatrixWorkspaceState';

function buildTinyArchiMateModel(): Model {
  const model = createEmptyModel({ name: 'Tiny' });

  const a = createElement({ id: 'A', name: 'Actor A', type: 'BusinessActor', layer: 'Business' });
  const b = createElement({ id: 'B', name: 'App B', type: 'ApplicationComponent', layer: 'Application' });

  model.elements[a.id] = a;
  model.elements[b.id] = b;

  return model;
}

describe('useMatrixWorkspaceState contract', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('defaults derive uiQuery from axes and prefs', async () => {
    const model = buildTinyArchiMateModel();

    const { result } = renderHook(() =>
      useMatrixWorkspaceState({
        model,
        modelId: 'matrix_contract_defaults',
        modelKind: 'archimate',
        direction: 'outgoing',
        relationshipTypes: ['Serving', 'Flow'],
        selectionElementIds: [],
      })
    );

    await waitFor(() => expect(result.current.state.axes.rowSource).toBe('facet'));

    expect(result.current.state.axes.colSource).toBe('facet');
    expect(result.current.state.axes.rowIds).toEqual(['A', 'B']);
    expect(result.current.state.axes.colIds).toEqual(['A', 'B']);
    expect(result.current.derived.canBuild).toBe(true);

    expect(result.current.state.build.builtQuery).toBeNull();
    expect(result.current.state.build.buildNonce).toBe(0);

    expect(result.current.state.uiQuery.direction).toBe('outgoing');
    expect(result.current.state.uiQuery.relationshipTypes).toEqual(['Serving', 'Flow']);

    expect(result.current.state.preferences.cellMetricId).toBe('matrixRelationshipCount');
    expect(result.current.state.preferences.heatmapEnabled).toBe(false);
    expect(result.current.state.preferences.hideEmpty).toBe(false);
    expect(result.current.state.preferences.highlightMissing).toBe(true);
  });

  test('build produces builtQuery with correct direction mapping', async () => {
    const model = buildTinyArchiMateModel();

    const { result } = renderHook(() =>
      useMatrixWorkspaceState({
        model,
        modelId: 'matrix_contract_build',
        modelKind: 'archimate',
        direction: 'incoming',
        relationshipTypes: ['Serving'],
        selectionElementIds: [],
      })
    );

    await waitFor(() => expect(result.current.derived.canBuild).toBe(true));

    act(() => {
      result.current.actions.build.build();
    });

    expect(result.current.state.build.builtQuery).not.toBeNull();
    expect(result.current.state.build.buildNonce).toBe(1);

    // incoming maps to colToRow
    expect(result.current.state.build.builtQuery?.direction).toBe('colToRow');
    expect(result.current.state.build.builtQuery?.relationshipTypes).toEqual(['Serving']);
    expect(result.current.state.build.builtQuery?.rowIds).toEqual(['A', 'B']);
    expect(result.current.state.build.builtQuery?.colIds).toEqual(['A', 'B']);
  });

  test('swapAxes swaps axis draft fields and resulting id lists', async () => {
    const model = buildTinyArchiMateModel();

    const { result } = renderHook(() =>
      useMatrixWorkspaceState({
        model,
        modelId: 'matrix_contract_swap',
        modelKind: 'archimate',
        direction: 'outgoing',
        relationshipTypes: ['Serving'],
        selectionElementIds: ['A'],
      })
    );

    await waitFor(() => expect(result.current.derived.canBuild).toBe(true));

    act(() => {
      result.current.actions.axes.setRowSource('selection');
      result.current.actions.axes.setRowElementType('BusinessActor');
      result.current.actions.axes.setRowLayer('Business');
      result.current.actions.axes.setRowSelectionIds(['A']);

      result.current.actions.axes.setColSource('facet');
      result.current.actions.axes.setColElementType('ApplicationComponent');
      result.current.actions.axes.setColLayer('Application');
      result.current.actions.axes.setColSelectionIds(['B']);
    });

    act(() => {
      result.current.actions.axes.swapAxes();
    });

    expect(result.current.state.axes.rowSource).toBe('facet');
    expect(result.current.state.axes.colSource).toBe('selection');

    expect(result.current.state.axes.rowElementType).toBe('ApplicationComponent');
    expect(result.current.state.axes.colElementType).toBe('BusinessActor');

    expect(result.current.state.axes.rowLayer).toBe('Application');
    expect(result.current.state.axes.colLayer).toBe('Business');

    expect(result.current.state.axes.rowSelectionIds).toEqual(['B']);
    expect(result.current.state.axes.colSelectionIds).toEqual(['A']);

    // row facet now matches only ApplicationComponent (B)
    expect(result.current.state.axes.rowIds).toEqual(['B']);
    // col selection now uses selected ids (A)
    expect(result.current.state.axes.colIds).toEqual(['A']);
  });

  test('resetDraft resets axes and clears selected preset and snapshot ids', async () => {
    const model = buildTinyArchiMateModel();

    const { result } = renderHook(() =>
      useMatrixWorkspaceState({
        model,
        modelId: 'matrix_contract_reset',
        modelKind: 'archimate',
        direction: 'outgoing',
        relationshipTypes: ['Serving'],
        selectionElementIds: ['A', 'B'],
      })
    );

    await waitFor(() => expect(result.current.state.axes.rowSource).toBe('facet'));

    act(() => {
      result.current.actions.axes.setRowSource('selection');
      result.current.actions.axes.setRowSelectionIds(['A', 'B']);
      result.current.actions.axes.setColSource('selection');
      result.current.actions.axes.setColSelectionIds(['B']);

      result.current.actions.presets.setPresetId('preset_test');
      result.current.actions.presets.setSnapshotId('snapshot_test');
    });

    await waitFor(() => expect(result.current.state.presets.presetId).toBe('preset_test'));
    await waitFor(() => expect(result.current.state.presets.snapshotId).toBe('snapshot_test'));

    act(() => {
      result.current.actions.axes.resetDraft();
    });

    expect(result.current.state.axes.rowSource).toBe('facet');
    expect(result.current.state.axes.colSource).toBe('facet');

    expect(result.current.state.axes.rowElementType).toBe('');
    expect(result.current.state.axes.colElementType).toBe('');

    expect(result.current.state.axes.rowLayer).toBe('');
    expect(result.current.state.axes.colLayer).toBe('');

    expect(result.current.state.axes.rowSelectionIds).toEqual([]);
    expect(result.current.state.axes.colSelectionIds).toEqual([]);

    expect(result.current.state.presets.presetId).toBe('');
    expect(result.current.state.presets.snapshotId).toBe('');
  });
});
