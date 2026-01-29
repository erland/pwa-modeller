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

    await waitFor(() => expect(result.current.legacy.rowSource).toBe('facet'));

    expect(result.current.legacy.colSource).toBe('facet');
    expect(result.current.legacy.rowIds).toEqual(['A', 'B']);
    expect(result.current.legacy.colIds).toEqual(['A', 'B']);
    expect(result.current.legacy.canBuild).toBe(true);

    expect(result.current.legacy.builtQuery).toBeNull();
    expect(result.current.legacy.buildNonce).toBe(0);

    expect(result.current.legacy.uiQuery.direction).toBe('outgoing');
    expect(result.current.legacy.uiQuery.relationshipTypes).toEqual(['Serving', 'Flow']);

    expect(result.current.legacy.cellMetricId).toBe('matrixRelationshipCount');
    expect(result.current.legacy.heatmapEnabled).toBe(false);
    expect(result.current.legacy.hideEmpty).toBe(false);
    expect(result.current.legacy.highlightMissing).toBe(true);
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

    await waitFor(() => expect(result.current.legacy.canBuild).toBe(true));

    act(() => {
      result.current.legacy.build();
    });

    expect(result.current.legacy.builtQuery).not.toBeNull();
    expect(result.current.legacy.buildNonce).toBe(1);

    // incoming maps to colToRow
    expect(result.current.legacy.builtQuery?.direction).toBe('colToRow');
    expect(result.current.legacy.builtQuery?.relationshipTypes).toEqual(['Serving']);
    expect(result.current.legacy.builtQuery?.rowIds).toEqual(['A', 'B']);
    expect(result.current.legacy.builtQuery?.colIds).toEqual(['A', 'B']);
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

    await waitFor(() => expect(result.current.legacy.canBuild).toBe(true));

    act(() => {
      result.current.legacy.setRowSource('selection');
      result.current.legacy.setRowElementType('BusinessActor');
      result.current.legacy.setRowLayer('Business');
      result.current.legacy.setRowSelectionIds(['A']);

      result.current.legacy.setColSource('facet');
      result.current.legacy.setColElementType('ApplicationComponent');
      result.current.legacy.setColLayer('Application');
      result.current.legacy.setColSelectionIds(['B']);
    });

    act(() => {
      result.current.legacy.swapAxes();
    });

    expect(result.current.legacy.rowSource).toBe('facet');
    expect(result.current.legacy.colSource).toBe('selection');

    expect(result.current.legacy.rowElementType).toBe('ApplicationComponent');
    expect(result.current.legacy.colElementType).toBe('BusinessActor');

    expect(result.current.legacy.rowLayer).toBe('Application');
    expect(result.current.legacy.colLayer).toBe('Business');

    expect(result.current.legacy.rowSelectionIds).toEqual(['B']);
    expect(result.current.legacy.colSelectionIds).toEqual(['A']);

    // row facet now matches only ApplicationComponent (B)
    expect(result.current.legacy.rowIds).toEqual(['B']);
    // col selection now uses selected ids (A)
    expect(result.current.legacy.colIds).toEqual(['A']);
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

    await waitFor(() => expect(result.current.legacy.rowSource).toBe('facet'));

    act(() => {
      result.current.legacy.setRowSource('selection');
      result.current.legacy.setRowSelectionIds(['A', 'B']);
      result.current.legacy.setColSource('selection');
      result.current.legacy.setColSelectionIds(['B']);

      result.current.legacy.setPresetId('preset_test');
      result.current.legacy.setSnapshotId('snapshot_test');
    });

    await waitFor(() => expect(result.current.legacy.presetId).toBe('preset_test'));
    await waitFor(() => expect(result.current.legacy.snapshotId).toBe('snapshot_test'));

    act(() => {
      result.current.legacy.resetDraft();
    });

    expect(result.current.legacy.rowSource).toBe('facet');
    expect(result.current.legacy.colSource).toBe('facet');

    expect(result.current.legacy.rowElementType).toBe('');
    expect(result.current.legacy.colElementType).toBe('');

    expect(result.current.legacy.rowLayer).toBe('');
    expect(result.current.legacy.colLayer).toBe('');

    expect(result.current.legacy.rowSelectionIds).toEqual([]);
    expect(result.current.legacy.colSelectionIds).toEqual([]);

    expect(result.current.legacy.presetId).toBe('');
    expect(result.current.legacy.snapshotId).toBe('');
  });
});
