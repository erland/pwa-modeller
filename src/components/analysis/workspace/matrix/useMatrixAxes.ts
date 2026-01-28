import { useMemo, useState } from 'react';

import type { ElementType, Model, ModelKind } from '../../../../domain';
import { getAnalysisAdapter } from '../../../../analysis/adapters/registry';
import type { MatrixAxisSource } from './types';

export function useMatrixAxes(args: {
  model: Model | null;
  modelKind: ModelKind;
}) {
  const { model, modelKind } = args;

  const [rowSource, setRowSource] = useState<MatrixAxisSource>('facet');
  const [rowElementType, setRowElementType] = useState<ElementType | ''>('');
  const [rowLayer, setRowLayer] = useState<string | ''>('');
  const [rowSelectionIds, setRowSelectionIds] = useState<string[]>([]);

  const [colSource, setColSource] = useState<MatrixAxisSource>('facet');
  const [colElementType, setColElementType] = useState<ElementType | ''>('');
  const [colLayer, setColLayer] = useState<string | ''>('');
  const [colSelectionIds, setColSelectionIds] = useState<string[]>([]);

  const resolveFacetIds = useMemo(() => {
    if (!model) return { rowIds: [] as string[], colIds: [] as string[] };
    const adapter = getAnalysisAdapter(modelKind);
    const wantedRowLayer = rowLayer || null;
    const wantedColLayer = colLayer || null;

    const wantedRowType = rowElementType || null;
    const wantedColType = colElementType || null;

    const rowIds: string[] = [];
    const colIds: string[] = [];

    for (const el of Object.values(model.elements ?? {})) {
      if (!el?.id) continue;
      const facets = adapter.getNodeFacetValues(el, model);
      const typeV = facets.elementType;
      const layerV = facets.archimateLayer;

      const matches = (wantedType: string | null, wantedLayer: string | null): boolean => {
        if (wantedType) {
          if (typeof typeV !== 'string' || typeV !== wantedType) return false;
        }
        if (wantedLayer) {
          if (typeof layerV === 'string') {
            if (layerV !== wantedLayer) return false;
          } else if (Array.isArray(layerV)) {
            if (!layerV.includes(wantedLayer)) return false;
          } else {
            return false;
          }
        }
        return true;
      };

      if (matches(wantedRowType, wantedRowLayer)) rowIds.push(el.id);
      if (matches(wantedColType, wantedColLayer)) colIds.push(el.id);
    }

    return { rowIds, colIds };
  }, [colElementType, colLayer, model, modelKind, rowElementType, rowLayer]);

  const rowIds = rowSource === 'selection' ? rowSelectionIds : resolveFacetIds.rowIds;
  const colIds = colSource === 'selection' ? colSelectionIds : resolveFacetIds.colIds;

  return {
    rowSource,
    setRowSource,
    rowElementType,
    setRowElementType,
    rowLayer,
    setRowLayer,
    rowSelectionIds,
    setRowSelectionIds,

    colSource,
    setColSource,
    colElementType,
    setColElementType,
    colLayer,
    setColLayer,
    colSelectionIds,
    setColSelectionIds,

    rowIds,
    colIds,
  };
}
