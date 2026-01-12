import { useCallback } from 'react';
import type { ArchimateLayer, ElementType } from '../../../domain';
import { ELEMENT_TYPES_BY_LAYER } from '../../../domain';

const ELEMENT_TYPE_TO_LAYER: Partial<Record<ElementType, ArchimateLayer>> = (() => {
  const map: Partial<Record<ElementType, ArchimateLayer>> = {};
  (Object.keys(ELEMENT_TYPES_BY_LAYER) as ArchimateLayer[]).forEach((layer) => {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer] ?? []) map[t] = layer;
  });
  return map;
})();

const LAYER_BG_VAR: Record<ArchimateLayer, string> = {
  Strategy: 'var(--arch-layer-strategy)',
  Motivation: 'var(--arch-layer-motivation)',
  Business: 'var(--arch-layer-business)',
  Application: 'var(--arch-layer-application)',
  Technology: 'var(--arch-layer-technology)',
  Physical: 'var(--arch-layer-physical)',
  ImplementationMigration: 'var(--arch-layer-implementation)',
};

/**
 * UI helper: determine which background CSS variable to use for a given element type.
 */
export function useElementBgVar() {
  const getElementBgVar = useCallback((t: ElementType) => {
    const layer = ELEMENT_TYPE_TO_LAYER[t] ?? 'Business';
    return LAYER_BG_VAR[layer];
  }, []);

  return { getElementBgVar };
}
