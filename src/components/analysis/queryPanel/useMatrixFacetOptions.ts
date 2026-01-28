import { useMemo } from 'react';

import type { ElementType, Model, ModelKind } from '../../../domain';

import {
  collectFacetValues,
  collectFacetValuesConstrained,
  sortElementTypesForDisplay
} from './utils';

export type MatrixFacetOptions = {
  availableElementTypesAll: ElementType[];
  availableElementTypesByLayer: Map<string, ElementType[]>;
  availableRowElementTypes: ElementType[];
  availableColElementTypes: ElementType[];
};

export function useMatrixFacetOptions(args: {
  model: Model;
  modelKind: ModelKind;
  hasLayerFacet: boolean;
  hasElementTypeFacet: boolean;
  availableLayers: string[];
  matrixRowLayer: string | '';
  matrixColLayer: string | '';
}): MatrixFacetOptions {
  const {
    model,
    modelKind,
    hasLayerFacet,
    hasElementTypeFacet,
    availableLayers,
    matrixRowLayer,
    matrixColLayer
  } = args;

  // Matrix needs all element types (not constrained by the global layer filter).
  const availableElementTypesAll = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    const types = collectFacetValues<ElementType>(model, modelKind, 'elementType');
    return sortElementTypesForDisplay(types);
  }, [hasElementTypeFacet, model, modelKind]);

  const availableElementTypesByLayer = useMemo(() => {
    if (!hasElementTypeFacet || !hasLayerFacet) return new Map<string, ElementType[]>();
    const map = new Map<string, ElementType[]>();
    for (const layer of availableLayers) {
      const types = collectFacetValuesConstrained<ElementType>(
        model,
        modelKind,
        'elementType',
        'archimateLayer',
        [layer]
      );
      map.set(layer, sortElementTypesForDisplay(types));
    }
    return map;
  }, [availableLayers, hasElementTypeFacet, hasLayerFacet, model, modelKind]);

  const availableRowElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (!matrixRowLayer || !hasLayerFacet) return availableElementTypesAll;
    return availableElementTypesByLayer.get(matrixRowLayer) ?? ([] as ElementType[]);
  }, [availableElementTypesAll, availableElementTypesByLayer, hasElementTypeFacet, hasLayerFacet, matrixRowLayer]);

  const availableColElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (!matrixColLayer || !hasLayerFacet) return availableElementTypesAll;
    return availableElementTypesByLayer.get(matrixColLayer) ?? ([] as ElementType[]);
  }, [availableElementTypesAll, availableElementTypesByLayer, hasElementTypeFacet, hasLayerFacet, matrixColLayer]);

  return {
    availableElementTypesAll,
    availableElementTypesByLayer,
    availableRowElementTypes,
    availableColElementTypes
  };
}
