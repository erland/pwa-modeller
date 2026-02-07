import { act, renderHook } from '@testing-library/react';

import type { Relationship } from '../../../../domain';

import { noSelection, type Selection } from '../../../model/selection';
import { useSandboxSelectionController } from '../useSandboxSelectionController';

import type { SandboxNode } from '../../workspace/controller/sandboxTypes';

function mkEvent<T extends Element>(opts?: { shiftKey?: boolean }): any {
  return {
    stopPropagation: jest.fn(),
    shiftKey: Boolean(opts?.shiftKey),
    // For onCanvasClick background logic
    target: {} as T,
    currentTarget: {} as T,
  };
}

describe('useSandboxSelectionController', () => {
  test('shift-click pair selection: primary is stable, secondary is replaced, toggles off when re-clicking', () => {
    const nodeById = new Map<string, SandboxNode>([
      ['A', { elementId: 'A', x: 0, y: 0 }],
      ['B', { elementId: 'B', x: 0, y: 0 }],
      ['C', { elementId: 'C', x: 0, y: 0 }],
    ]);

    const onSelectElement = jest.fn();

    const { result } = renderHook((props: { selection: Selection; selectionElementIds: string[] }) =>
      useSandboxSelectionController({
        selection: props.selection,
        selectionElementIds: props.selectionElementIds,
        nodeById,
        modelRelationships: {},
        consumeSuppressNextBackgroundClick: () => false,
        onSelectElement,
        onSelectRelationship: jest.fn(),
        onClearSelection: jest.fn(),
      })
    , { initialProps: { selection: noSelection, selectionElementIds: [] } });

    // Normal click sets local primary selection.
    act(() => {
      result.current.onClickNode(mkEvent<SVGGElement>({ shiftKey: false }), 'A');
    });
    expect(result.current.pairSelection).toEqual(['A']);

    // Shift-click adds secondary.
    act(() => {
      result.current.onClickNode(mkEvent<SVGGElement>({ shiftKey: true }), 'B');
    });
    expect(result.current.pairSelection).toEqual(['A', 'B']);
    expect(result.current.pairAnchors).toEqual(['A', 'B']);

    // Shift-click a third element replaces secondary, primary stays.
    act(() => {
      result.current.onClickNode(mkEvent<SVGGElement>({ shiftKey: true }), 'C');
    });
    expect(result.current.pairSelection).toEqual(['A', 'C']);

    // Shift-click primary removes it (leaves the other).
    act(() => {
      result.current.onClickNode(mkEvent<SVGGElement>({ shiftKey: true }), 'A');
    });
    expect(result.current.pairSelection).toEqual(['C']);

    // Shift-click same element again when it's the only one clears.
    act(() => {
      result.current.onClickNode(mkEvent<SVGGElement>({ shiftKey: true }), 'C');
    });
    expect(result.current.pairSelection).toEqual([]);

    // Selection callback fires on each node click.
    expect(onSelectElement).toHaveBeenCalledTimes(5);
  });

  test('insertAnchors are deduped and only include element ids that exist as nodes', () => {
    const nodeById = new Map<string, SandboxNode>([
      ['A', { elementId: 'A', x: 0, y: 0 }],
      ['B', { elementId: 'B', x: 0, y: 0 }],
    ]);

    const { result, rerender } = renderHook(
      (props: { selectionElementIds: string[] }) =>
        useSandboxSelectionController({
          selection: noSelection,
          selectionElementIds: props.selectionElementIds,
          nodeById,
          modelRelationships: {},
          consumeSuppressNextBackgroundClick: () => false,
          onSelectElement: jest.fn(),
          onSelectRelationship: jest.fn(),
          onClearSelection: jest.fn(),
        }),
      { initialProps: { selectionElementIds: ['A', 'A', 'MISSING', 'B'] } }
    );

    expect(result.current.insertAnchors.sort()).toEqual(['A', 'B']);

    rerender({ selectionElementIds: ['MISSING'] });
    expect(result.current.insertAnchors).toEqual([]);
  });

  test('edge hit toggles relationship selection; selectedEdge is only returned when endpoints are present as nodes', () => {
    const nodeById = new Map<string, SandboxNode>([
      ['A', { elementId: 'A', x: 0, y: 0 }],
      ['B', { elementId: 'B', x: 0, y: 0 }],
    ]);

    const modelRelationships: Record<string, Relationship> = {
      R1: { id: 'R1', type: 'Flow', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
      R2: { id: 'R2', type: 'Flow', sourceElementId: 'A', targetElementId: 'MISSING', attrs: {} },
    } as any;

    const onSelectRelationship = jest.fn();
    const onClearSelection = jest.fn();

    const { result } = renderHook(() =>
      useSandboxSelectionController({
        selection: noSelection,
        selectionElementIds: [],
        nodeById,
        modelRelationships,
        consumeSuppressNextBackgroundClick: () => false,
        onSelectElement: jest.fn(),
        onSelectRelationship,
        onClearSelection,
      })
    );

    act(() => {
      result.current.onEdgeHitClick(mkEvent<SVGPathElement>(), 'R1');
    });
    expect(onSelectRelationship).toHaveBeenCalledWith('R1');
    expect(result.current.selectedEdgeId).toBe('R1');
    expect(result.current.selectedEdge).toEqual({
      id: 'R1',
      type: 'Flow',
      sourceElementId: 'A',
      targetElementId: 'B',
    });

    // Clicking again toggles off and clears selection.
    act(() => {
      result.current.onEdgeHitClick(mkEvent<SVGPathElement>(), 'R1');
    });
    expect(result.current.selectedEdgeId).toBe(null);
    expect(onClearSelection).toHaveBeenCalledTimes(1);

    // Relationship with missing endpoint nodes does not produce selectedEdge.
    act(() => {
      result.current.onEdgeHitClick(mkEvent<SVGPathElement>(), 'R2');
    });
    expect(result.current.selectedEdgeId).toBe('R2');
    expect(result.current.selectedEdge).toBe(null);
  });
});
