import { useCallback } from 'react';

import type { ElementType } from '../../../domain';

export type MatrixAxisSource = 'facet' | 'selection';

type Args = {
  matrixRowSource: MatrixAxisSource;
  matrixRowElementType: ElementType | '';
  onChangeMatrixRowLayer: (v: string | '') => void;
  onChangeMatrixRowElementType: (v: ElementType | '') => void;

  matrixColSource: MatrixAxisSource;
  matrixColElementType: ElementType | '';
  onChangeMatrixColLayer: (v: string | '') => void;
  onChangeMatrixColElementType: (v: ElementType | '') => void;

  availableElementTypesByLayer: Map<string, ElementType[]>;
};

/**
 * Centralizes the small but important UX rule:
 * if the user selects a layer that does not contain the currently selected element type,
 * clear the element type to avoid an impossible combination.
 */
export function useMatrixAxesLayerGuards({
  matrixRowSource,
  matrixRowElementType,
  onChangeMatrixRowLayer,
  onChangeMatrixRowElementType,
  matrixColSource,
  matrixColElementType,
  onChangeMatrixColLayer,
  onChangeMatrixColElementType,
  availableElementTypesByLayer
}: Args): {
  onChangeMatrixRowLayerGuarded: (nextLayer: string | '') => void;
  onChangeMatrixColLayerGuarded: (nextLayer: string | '') => void;
} {
  const onChangeMatrixRowLayerGuarded = useCallback(
    (nextLayer: string | '') => {
      onChangeMatrixRowLayer(nextLayer);
      if (matrixRowSource !== 'facet') {
        return;
      }
      if (
        nextLayer &&
        matrixRowElementType &&
        !availableElementTypesByLayer.get(nextLayer)?.includes(matrixRowElementType)
      ) {
        onChangeMatrixRowElementType('');
      }
    },
    [
      availableElementTypesByLayer,
      matrixRowElementType,
      matrixRowSource,
      onChangeMatrixRowElementType,
      onChangeMatrixRowLayer
    ]
  );

  const onChangeMatrixColLayerGuarded = useCallback(
    (nextLayer: string | '') => {
      onChangeMatrixColLayer(nextLayer);
      if (matrixColSource !== 'facet') {
        return;
      }
      if (
        nextLayer &&
        matrixColElementType &&
        !availableElementTypesByLayer.get(nextLayer)?.includes(matrixColElementType)
      ) {
        onChangeMatrixColElementType('');
      }
    },
    [
      availableElementTypesByLayer,
      matrixColElementType,
      matrixColSource,
      onChangeMatrixColElementType,
      onChangeMatrixColLayer
    ]
  );

  return { onChangeMatrixRowLayerGuarded, onChangeMatrixColLayerGuarded };
}
