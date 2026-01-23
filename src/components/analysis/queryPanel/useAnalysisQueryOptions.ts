import { useEffect, useMemo } from 'react';

import type { ElementType, Model, ModelKind, RelationshipType } from '../../../domain';
import { getAnalysisAdapter } from '../../../analysis/adapters/registry';

import type { AnalysisMode } from '../AnalysisQueryPanel';

import {
  collectFacetValues,
  collectFacetValuesConstrained,
  dedupeSort,
  getAvailableRelationshipTypes,
  pruneToAllowed,
  sortElementTypesForDisplay
} from './utils';

type Params = {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;

  relationshipTypes: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;

  layers: string[];
  onChangeLayers: (layers: string[]) => void;

  elementTypes: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;
};

export function useAnalysisQueryOptions({
  model,
  modelKind,
  mode,
  relationshipTypes,
  onChangeRelationshipTypes,
  layers,
  onChangeLayers,
  elementTypes,
  onChangeElementTypes
}: Params) {
  const modelName = model.metadata?.name || 'Model';

  const adapter = useMemo(() => getAnalysisAdapter(modelKind), [modelKind]);
  const facetDefinitions = useMemo(() => adapter.getFacetDefinitions(model), [adapter, model]);
  const hasLayerFacet = facetDefinitions.some((f) => f.id === 'archimateLayer');
  const hasElementTypeFacet = facetDefinitions.some((f) => f.id === 'elementType');

  const availableRelationshipTypes = useMemo(() => getAvailableRelationshipTypes(model), [model]);
  const availableLayers = useMemo(() => {
    if (!hasLayerFacet) return [] as string[];
    return collectFacetValues<string>(model, modelKind, 'archimateLayer');
  }, [hasLayerFacet, model, modelKind]);

  const relationshipTypesSorted = useMemo(
    () => dedupeSort(relationshipTypes) as RelationshipType[],
    [relationshipTypes]
  );

  const layersSorted = useMemo(
    () => dedupeSort(layers) as string[],
    [layers]
  );

  const allowedElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (layersSorted.length === 0) return [] as ElementType[];
    const types = collectFacetValuesConstrained<ElementType>(
      model,
      modelKind,
      'elementType',
      'archimateLayer',
      layersSorted
    );
    return sortElementTypesForDisplay(types);
  }, [hasElementTypeFacet, model, modelKind, layersSorted]);

  const elementTypesSorted = useMemo(
    () => dedupeSort(elementTypes) as ElementType[],
    [elementTypes]
  );

  // Prune selected filters when the loaded model changes.
  useEffect(() => {
    const pruned = pruneToAllowed(relationshipTypesSorted, availableRelationshipTypes);
    if (pruned !== relationshipTypesSorted) onChangeRelationshipTypes(pruned);
  }, [availableRelationshipTypes, onChangeRelationshipTypes, relationshipTypesSorted]);

  useEffect(() => {
    const pruned = pruneToAllowed(layersSorted, availableLayers);
    if (pruned !== layersSorted) onChangeLayers(pruned);
  }, [layersSorted, availableLayers, onChangeLayers]);

  useEffect(() => {
    if (mode === 'paths') return;
    const pruned = pruneToAllowed(elementTypesSorted, allowedElementTypes);
    if (pruned !== elementTypesSorted) onChangeElementTypes(pruned);
  }, [allowedElementTypes, elementTypesSorted, mode, onChangeElementTypes]);

  return {
    modelName,
    hasLayerFacet,
    hasElementTypeFacet,
    availableRelationshipTypes,
    availableLayers,
    allowedElementTypes,
    relationshipTypesSorted,
    layersSorted,
    elementTypesSorted
  };
}
