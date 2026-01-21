import { ELEMENT_TYPES_BY_LAYER } from '../../config/archimatePalette';
import type { ArchimateLayer, ElementType, RelationshipType } from '../../types';

/**
 * ArchiMate-specific policy helpers for auto layout.
 *
 * Keep "taste" (edge weights, grouping hints) in one place so the
 * layout engine adapter (ELK) stays generic.
 */

// Build an inverse lookup from ElementType -> ArchimateLayer.
const LAYER_BY_ELEMENT_TYPE: Record<string, ArchimateLayer> = (() => {
  const out: Record<string, ArchimateLayer> = {};
  (Object.keys(ELEMENT_TYPES_BY_LAYER) as ArchimateLayer[]).forEach((layer) => {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer]) out[t] = layer;
  });
  return out;
})();

/**
 * Returns the ArchiMate layer for a given element type, if known.
 */
export function getArchiMateLayerHint(elementType: ElementType | string | undefined): ArchimateLayer | undefined {
  if (!elementType) return undefined;
  return LAYER_BY_ELEMENT_TYPE[elementType];
}

/**
 * Returns a stable grouping key for an element type.
 *
 * For now we group by layer. Later we can extend this to group by:
 * - viewpoint
 * - folder/package
 * - user-defined groups
 */
export function getArchiMateGroupIdHint(elementType: ElementType | string | undefined): string | undefined {
  const layer = getArchiMateLayerHint(elementType);
  return layer;
}

/**
 * Edge weights help the layout engine prioritize which relationships drive the shape.
 * Higher means "pull harder" in the layout.
 */
export function getArchiMateEdgeWeight(relationshipType: RelationshipType | string | undefined): number {
  switch (relationshipType) {
    case 'Flow':
    case 'Triggering':
      return 10;
    case 'Serving':
      return 8;
    case 'Realization':
      return 7;
    case 'Assignment':
      return 6;
    case 'Access':
      return 5;
    case 'Composition':
    case 'Aggregation':
      return 4;
    case 'Influence':
      return 3;
    case 'Specialization':
      return 2;
    case 'Association':
      return 1;
    default:
      return 1;
  }
}
