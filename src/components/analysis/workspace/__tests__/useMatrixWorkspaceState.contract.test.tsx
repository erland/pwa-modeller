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

    await waitFor(() => expect(result.current.rowSource).toBe('facet'));

    expect(result.current.colSource).toBe('facet');
    expect(result.current.rowIds).toEqual(['A', 'B']);
    expect(result.current.colIds).toEqual(['A', 'B']);
    expect(result.current.canBuild).toBe(true);

    expect(result.current.builtQuery).toBeNull();
    expect(result.current.buildNonce).toBe(0);

    expect(result.current.uiQuery.direction).toBe('outgoing');
    expect(result.current.uiQuery.relationshipTypes).toEqual(['Serving', 'Flow']);

    expect(result.current.cellMetricId).toBe('matrixRelationshipCount');
    expect(result.current.heatmapEnabled).toBe(false);
    expect(result.current.hideEmpty).toBe(false);
    expect(result.current.highlightMissing).toBe(true);
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

    await waitFor(() => expect(result.current.canBuild).toBe(true));

    act(() => {
      result.current.build();
    });

    expect(result.current.builtQuery).not.toBeNull();
    expect(result.current.buildNonce).toBe(1);

    // incoming maps to colToRow
    expect(result.current.builtQuery?.direction).toBe('colToRow');
    expect(result.current.builtQuery?.relationshipTypes).toEqual(['Serving']);
    expect(result.current.builtQuery?.rowIds).toEqual(['A', 'B']);
    expect(result.current.builtQuery?.colIds).toEqual(['A', 'B']);
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

    await waitFor(() => expect(result.current.canBuild).toBe(true));

    act(() => {
      result.current.setRowSource('selection');
      result.current.setRowElementType('BusinessActor');
      result.current.setRowLayer('Business');
      result.current.setRowSelectionIds(['A']);

      result.current.setColSource('facet');
      result.current.setColElementType('ApplicationComponent');
      result.current.setColLayer('Application');
      result.current.setColSelectionIds(['B']);
    });

    act(() => {
      result.current.swapAxes();
    });

    expect(result.current.rowSource).toBe('facet');
    expect(result.current.colSource).toBe('selection');

    expect(result.current.rowElementType).toBe('ApplicationComponent');
    expect(result.current.colElementType).toBe('BusinessActor');

    expect(result.current.rowLayer).toBe('Application');
    expect(result.current.colLayer).toBe('Business');

    expect(result.current.rowSelectionIds).toEqual(['B']);
    expect(result.current.colSelectionIds).toEqual(['A']);

    // row facet now matches only ApplicationComponent (B)
    expect(result.current.rowIds).toEqual(['B']);
    // col selection now uses selected ids (A)
    expect(result.current.colIds).toEqual(['A']);
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

    await waitFor(() => expect(result.current.rowSource).toBe('facet'));

    act(() => {
      result.current.setRowSource('selection');
      result.current.setRowSelectionIds(['A', 'B']);
      result.current.setColSource('selection');
      result.current.setColSelectionIds(['B']);

      result.current.setPresetId('preset_test');
      result.current.setSnapshotId('snapshot_test');
    });

    await waitFor(() => expect(result.current.presetId).toBe('preset_test'));
    await waitFor(() => expect(result.current.snapshotId).toBe('snapshot_test'));

    act(() => {
      result.current.resetDraft();
    });

    expect(result.current.rowSource).toBe('facet');
    expect(result.current.colSource).toBe('facet');

    expect(result.current.rowElementType).toBe('');
    expect(result.current.colElementType).toBe('');

    expect(result.current.rowLayer).toBe('');
    expect(result.current.colLayer).toBe('');

    expect(result.current.rowSelectionIds).toEqual([]);
    expect(result.current.colSelectionIds).toEqual([]);

    expect(result.current.presetId).toBe('');
    expect(result.current.snapshotId).toBe('');
  });
});
