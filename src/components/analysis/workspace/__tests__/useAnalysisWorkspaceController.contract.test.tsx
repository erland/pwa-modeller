import { act, renderHook, waitFor } from '@testing-library/react';

import type { Model } from '../../../../domain/types';
import { modelStore } from '../../../../store/modelStore';
import { useAnalysisWorkspaceController } from '../useAnalysisWorkspaceController';

function createTestModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'test' },
    elements: {
      A: { id: 'A', name: 'A', type: 'ApplicationComponent', layer: 'Application' },
      B: { id: 'B', name: 'B', type: 'ApplicationFunction', layer: 'Application' },
      C: { id: 'C', name: 'C', type: 'BusinessProcess', layer: 'Business' },
    },
    relationships: {
      R1: { id: 'R1', sourceElementId: 'A', targetElementId: 'B', type: 'Serving' },
      R2: { id: 'R2', sourceElementId: 'B', targetElementId: 'C', type: 'Flow' },
    },
    views: {},
    folders: {},
  };
}

describe('useAnalysisWorkspaceController (contract)', () => {
  beforeEach(() => {
    localStorage.clear();
    modelStore.reset();
    modelStore.loadModel(createTestModel(), null);
  });

  test('prefills draft start/source from selection in related mode', async () => {
    const { result } = renderHook(() =>
      useAnalysisWorkspaceController({
        modelKind: 'archimate',
        selection: { kind: 'element', elementId: 'A' },
      })
    );

    await waitFor(() => expect(result.current.state.draftStartId).toBe('A'));
    expect(result.current.state.draftSourceId).toBe('A');
  });

  test('in paths mode, selection prefills target when source is already set', async () => {
    const { result, rerender } = renderHook(
      (props: { elementId: string }) =>
        useAnalysisWorkspaceController({
          modelKind: 'archimate',
          selection: { kind: 'element', elementId: props.elementId },
        }),
      { initialProps: { elementId: 'A' } }
    );

    await waitFor(() => expect(result.current.state.draftStartId).toBe('A'));

    act(() => {
      result.current.actions.setMode('paths');
    });

    // Change selection to B -> should prefill target (since source is A)
    rerender({ elementId: 'B' });

    await waitFor(() => expect(result.current.state.draftTargetId).toBe('B'));
    expect(result.current.state.draftSourceId).toBe('A');
  });

  test('applyPreset(clear) resets filters and resets matrix axes draft', async () => {
    const { result } = renderHook(() =>
      useAnalysisWorkspaceController({
        modelKind: 'archimate',
        selection: { kind: 'element', elementId: 'A' },
      })
    );

    await waitFor(() => expect(result.current.state.draftStartId).toBe('A'));

    act(() => {
      // dirty filters
      result.current.actions.setDirection('incoming');
      result.current.actions.setRelationshipTypes(['Flow']);
      result.current.actions.setLayers(['Application']);
      result.current.actions.setElementTypes(['ApplicationComponent']);
      result.current.actions.setMaxDepth(2);
      result.current.actions.setIncludeStart(true);
      result.current.actions.setMaxPaths(5);
      result.current.actions.setMaxPathLength(3);

      // dirty matrix axes
      result.current.derived.matrix.actions.axes.setRowSource('selection');
      result.current.derived.matrix.actions.axes.setColSource('selection');
      result.current.derived.matrix.actions.axes.setRowSelectionIds(['A']);
      result.current.derived.matrix.actions.axes.setColSelectionIds(['B']);
    });

    act(() => {
      result.current.actions.applyPreset('clear');
    });

    await waitFor(() => expect(result.current.state.direction).toBe('both'));

    expect(result.current.state.relationshipTypes).toEqual([]);
    expect(result.current.state.layers).toEqual([]);
    expect(result.current.state.elementTypes).toEqual([]);
    expect(result.current.state.maxDepth).toBe(4);
    expect(result.current.state.includeStart).toBe(false);
    expect(result.current.state.maxPaths).toBe(10);
    expect(result.current.state.maxPathLength).toBeNull();

    // axes reset to defaults (facet)
    expect(result.current.derived.matrix.state.axes.rowSource).toBe('facet');
    expect(result.current.derived.matrix.state.axes.colSource).toBe('facet');
    expect(result.current.derived.matrix.state.axes.rowSelectionIds).toEqual([]);
    expect(result.current.derived.matrix.state.axes.colSelectionIds).toEqual([]);
  });

  test('run() commits active ids and produces results (related + paths)', async () => {
    const { result } = renderHook(() =>
      useAnalysisWorkspaceController({
        modelKind: 'archimate',
        selection: { kind: 'element', elementId: 'A' },
      })
    );

    await waitFor(() => expect(result.current.state.draftStartId).toBe('A'));

    act(() => {
      result.current.actions.run();
    });

    await waitFor(() => expect(result.current.derived.relatedResult).not.toBeNull());
    expect(result.current.derived.relatedResult?.startElementId).toBe('A');

    act(() => {
      result.current.actions.setMode('paths');
    });

    act(() => {
      result.current.actions.onChangeDraftTargetId('C');
    });

    // IMPORTANT: state updates are batched; wait for draftTargetId to update before running.
    await waitFor(() => expect(result.current.state.draftTargetId).toBe('C'));

    act(() => {
      result.current.actions.run();
    });

    await waitFor(() => expect(result.current.derived.pathsResult).not.toBeNull());
    expect(result.current.derived.pathsResult?.sourceElementId).toBe('A');
    expect(result.current.derived.pathsResult?.targetElementId).toBe('C');
    expect((result.current.derived.pathsResult?.paths ?? []).length).toBeGreaterThan(0);
  });
});
