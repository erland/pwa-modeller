import { act, renderHook } from '@testing-library/react';

import type { Relationship } from '../../../../domain';

import { useSandboxRelationships } from '../useSandboxRelationships';

import type { SandboxNode, SandboxRelationshipsState } from '../../workspace/controller/sandboxTypes';

function mkNodes(ids: string[]): SandboxNode[] {
  return ids.map((id, idx) => ({ elementId: id, x: idx * 10, y: 0 }));
}

describe('useSandboxRelationships', () => {
  test('filters base relationships to those with both endpoints present as sandbox nodes', () => {
    const modelRelationships: Record<string, Relationship> = {
      R1: { id: 'R1', type: 'Flow', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
      R2: { id: 'R2', type: 'Flow', sourceElementId: 'A', targetElementId: 'MISSING', attrs: {} },
      R3: { id: 'R3', type: 'Serving', sourceElementId: 'B', targetElementId: 'A', attrs: {} },
    } as any;

    const relationships: SandboxRelationshipsState = {
      show: true,
      mode: 'all',
      enabledTypes: [],
      explicitIds: [],
    };

    const { result } = renderHook(() =>
      useSandboxRelationships({
        modelRelationships,
        nodes: mkNodes(['A', 'B']),
        relationships,
        maxEdges: 100,
        onSetEnabledRelationshipTypes: jest.fn(),
      })
    );

    expect(result.current.baseVisibleRelationships.map((r) => r.id)).toEqual(['R1', 'R3']);
    expect(result.current.availableRelationshipTypes).toEqual(['Flow', 'Serving']);
    expect(result.current.visibleRelationships.map((r) => r.id)).toEqual(['R1', 'R3']);
  });

  test('type filtering defaults to enabling all available types when empty, and respects enabledTypes thereafter', () => {
    const modelRelationships: Record<string, Relationship> = {
      R1: { id: 'R1', type: 'Flow', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
      R2: { id: 'R2', type: 'Serving', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
    } as any;

    const onSetEnabledRelationshipTypes = jest.fn();

    const relationships: SandboxRelationshipsState = {
      show: true,
      mode: 'types',
      enabledTypes: [],
      explicitIds: [],
    };

    const { result, rerender } = renderHook(
      (props: { rel: SandboxRelationshipsState }) =>
        useSandboxRelationships({
          modelRelationships,
          nodes: mkNodes(['A', 'B']),
          relationships: props.rel,
          maxEdges: 100,
          onSetEnabledRelationshipTypes,
        }),
      { initialProps: { rel: relationships } }
    );

    // Effect should request enabling all types.
    expect(onSetEnabledRelationshipTypes).toHaveBeenCalledWith(['Flow', 'Serving']);

    // Now simulate that state has been updated to only allow 'Flow'.
    act(() => {
      rerender({
        rel: {
          ...relationships,
          enabledTypes: ['Flow'],
        },
      });
    });

    expect(result.current.selectedTypeCount).toBe(1);
    expect(result.current.visibleRelationships.map((r) => r.id)).toEqual(['R1']);
  });

  test('explicit mode only shows explicitIds and applies edge cap (overflow + renderedRelationships)', () => {
    const modelRelationships: Record<string, Relationship> = {
      R1: { id: 'R1', type: 'Flow', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
      R2: { id: 'R2', type: 'Flow', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
      R3: { id: 'R3', type: 'Flow', sourceElementId: 'A', targetElementId: 'B', attrs: {} },
    } as any;

    const relationships: SandboxRelationshipsState = {
      show: true,
      mode: 'explicit',
      enabledTypes: [],
      explicitIds: ['R3', 'R1', 'NOPE'],
    };

    const { result } = renderHook(() =>
      useSandboxRelationships({
        modelRelationships,
        nodes: mkNodes(['A', 'B']),
        relationships,
        maxEdges: 1,
        onSetEnabledRelationshipTypes: jest.fn(),
      })
    );

    expect(result.current.visibleRelationships.map((r) => r.id).sort()).toEqual(['R1', 'R3']);
    expect(result.current.edgeOverflow).toBe(1);
    expect(result.current.renderedRelationships).toHaveLength(1);
  });
});
