import type { ArchimateLayer, Element, Relationship, RelationshipType } from '../types';

export type AnalysisDirection = 'outgoing' | 'incoming' | 'both';

export interface AnalysisEdgeFilterOptions {
  /** Allowed relationship types. If omitted/empty, all relationship types are allowed. */
  relationshipTypes?: RelationshipType[];
}

export interface AnalysisNodeFilterOptions {
  /**
   * Allowed ArchiMate layers. If provided, only elements whose `layer` is in this list are considered
   * "included" for result sets. (Traversal may still walk through excluded nodes depending on query.)
   */
  archimateLayers?: ArchimateLayer[];
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

export function normalizeLayerFilter(opts?: AnalysisNodeFilterOptions): ReadonlySet<ArchimateLayer> | undefined {
  const layers = opts?.archimateLayers?.filter(Boolean);
  if (!layers || layers.length === 0) return undefined;
  return new Set(layers);
}

export function relationshipPassesTypeFilter(relationship: Relationship, typeSet?: ReadonlySet<RelationshipType>): boolean {
  if (!typeSet) return true;
  return typeSet.has(relationship.type);
}

export function elementPassesLayerFilter(element: Element, layerSet?: ReadonlySet<ArchimateLayer>): boolean {
  if (!layerSet) return true;
  // If filtering by ArchiMate layers, non-archimate elements (no layer) are excluded.
  if (!element.layer) return false;
  return layerSet.has(element.layer);
}
