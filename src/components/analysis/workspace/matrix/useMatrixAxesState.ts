import { useCallback } from 'react';

import type { Model, ModelKind } from '../../../../domain';

import { useMatrixAxes } from './useMatrixAxes';

export type UseMatrixAxesStateArgs = {
  model: Model | null;
  modelKind: ModelKind;
  selectionElementIds: string[];
};

/**
 * Axes state and axes-only actions for the Matrix workspace.
 */
export function useMatrixAxesState({ model, modelKind, selectionElementIds }: UseMatrixAxesStateArgs) {
  const axes = useMatrixAxes({ model, modelKind });

  const swapAxes = useCallback(() => {
    const nextRowSource = axes.colSource;
    const nextColSource = axes.rowSource;

    const nextRowElementType = axes.colElementType;
    const nextColElementType = axes.rowElementType;

    const nextRowLayer = axes.colLayer;
    const nextColLayer = axes.rowLayer;

    const nextRowSelectionIds = axes.colSelectionIds;
    const nextColSelectionIds = axes.rowSelectionIds;

    axes.setRowSource(nextRowSource);
    axes.setRowElementType(nextRowElementType);
    axes.setRowLayer(nextRowLayer);
    axes.setRowSelectionIds([...nextRowSelectionIds]);

    axes.setColSource(nextColSource);
    axes.setColElementType(nextColElementType);
    axes.setColLayer(nextColLayer);
    axes.setColSelectionIds([...nextColSelectionIds]);
  }, [axes]);

  const resetAxesDraft = useCallback(() => {
    axes.setRowSource('facet');
    axes.setRowElementType('');
    axes.setRowLayer('');
    axes.setRowSelectionIds([]);

    axes.setColSource('facet');
    axes.setColElementType('');
    axes.setColLayer('');
    axes.setColSelectionIds([]);
  }, [axes]);

  const captureSelectionAsRows = useCallback(() => {
    axes.setRowSource('selection');
    axes.setRowSelectionIds([...selectionElementIds]);
  }, [axes, selectionElementIds]);

  const captureSelectionAsCols = useCallback(() => {
    axes.setColSource('selection');
    axes.setColSelectionIds([...selectionElementIds]);
  }, [axes, selectionElementIds]);

  return {
    ...axes,
    swapAxes,
    resetAxesDraft,
    captureSelectionAsRows,
    captureSelectionAsCols,
  } as const;
}