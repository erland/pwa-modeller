import type { Element, ElementType, Relationship, RelationshipType } from '../types';

export type AnalysisDirection = 'outgoing' | 'incoming' | 'both';

export interface AnalysisEdgeFilterOptions {
  /** Allowed relationship types. If omitted/empty, all relationship types are allowed. */
  relationshipTypes?: RelationshipType[];
}

export interface AnalysisNodeFilterOptions {
  /**
   * Allowed element layer values. If provided, only elements whose `layer` matches one of these
   * values are considered "included" for result sets. (Traversal may still walk through excluded
   * nodes depending on the query.)
   */
  layers?: string[];

  /**
   * Allowed element types. If provided, only elements whose `type` is in this list are considered
   * "included" for result sets. Semantics follow the layer filter (query-specific).
   */
  elementTypes?: ElementType[];
}

export interface AnalysisCommonOptions extends AnalysisEdgeFilterOptions, AnalysisNodeFilterOptions {
  /** Traversal direction. Defaults to 'both'. */
  direction?: AnalysisDirection;
  /** Maximum traversal depth (number of relationship hops). Defaults to 4. */
  maxDepth?: number;
}

export interface RelatedElementsOptions extends AnalysisCommonOptions {
  /** Whether to include the start element in the returned hits. Defaults to false. */
  includeStart?: boolean;
}

export interface PathsBetweenOptions extends AnalysisCommonOptions {
  /** Maximum number of returned paths. Defaults to 10. */
  maxPaths?: number;
  /** Maximum allowed path length (in hops). If omitted, derived from BFS shortest path distance. */
  maxPathLength?: number;
}

export function normalizeRelationshipTypeFilter(opts?: AnalysisEdgeFilterOptions): ReadonlySet<RelationshipType> | undefined {
  const types = opts?.relationshipTypes?.filter(Boolean);
  if (!types || types.length === 0) return undefined;
  return new Set(types);
}

export function normalizeLayerFilter(opts?: AnalysisNodeFilterOptions): ReadonlySet<string> | undefined {
  const layers = opts?.layers?.filter(Boolean);
  if (!layers || layers.length === 0) return undefined;
  return new Set(layers);
}

export function normalizeElementTypeFilter(opts?: AnalysisNodeFilterOptions): ReadonlySet<ElementType> | undefined {
  const types = opts?.elementTypes?.filter(Boolean);
  if (!types || types.length === 0) return undefined;
  return new Set(types);
}

export function relationshipPassesTypeFilter(relationship: Relationship, typeSet?: ReadonlySet<RelationshipType>): boolean {
  if (!typeSet) return true;
  return typeSet.has(relationship.type);
}

export function elementPassesLayerFilter(element: Element, layerSet?: ReadonlySet<string>): boolean {
  if (!layerSet) return true;
  // If filtering by layers, elements without layer information are excluded.
  if (!element.layer) return false;
  return layerSet.has(element.layer);
}

export function elementPassesTypeFilter(element: Element, typeSet?: ReadonlySet<ElementType>): boolean {
  if (!typeSet) return true;
  if (!element.type) return false;
  return typeSet.has(element.type);
}
