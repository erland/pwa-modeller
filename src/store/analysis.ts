import { useMemo } from 'react';

import type {
  ElementType,
  Model,
  PathsBetweenOptions,
  PathsBetweenResult,
  RelatedElementsOptions,
  RelatedElementsResult,
  RelationshipType
} from '../domain';
import { queryPathsBetween, queryRelatedElements } from '../domain';

import { useModelStore } from './hooks';

function normalizeStringArray<T extends string>(arr: readonly T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  // Deduplicate + sort to keep stable keys deterministic.
  return Array.from(new Set(arr)).sort() as T[];
}

function stableAnalysisKey(opts: RelatedElementsOptions | PathsBetweenOptions | undefined): string {
  // NOTE (Analysis metrics plan): this key is ONLY for the domain queries (related/paths).
  // Heatmap/overlay metric options will be stored separately and should NOT affect these memoization keys
  // unless they change the *query* itself. If/when we introduce query-affecting metric params, add them
  // here in a backwards-compatible way and update relatedOptsFromKey/pathsOptsFromKey.

  if (!opts) return ''; 
  const o: {
    direction?: string;
    maxDepth?: number;
    includeStart?: boolean;
    maxPaths?: number;
    maxPathLength?: number;
    relationshipTypes?: string[];
    layers?: string[];
    elementTypes?: string[];
  } = {
    direction: opts.direction,
    maxDepth: opts.maxDepth,
    includeStart: (opts as RelatedElementsOptions).includeStart,
    maxPaths: (opts as PathsBetweenOptions).maxPaths,
    maxPathLength: (opts as PathsBetweenOptions).maxPathLength,
    relationshipTypes: normalizeStringArray<RelationshipType>(opts.relationshipTypes),
    layers: normalizeStringArray<string>(opts.layers),
    elementTypes: normalizeStringArray<ElementType>(opts.elementTypes)
  };
  return JSON.stringify(o);
}

function relatedOptsFromKey(key: string): RelatedElementsOptions {
  if (!key) return {}; 
  const parsed = JSON.parse(key) as {
    direction?: RelatedElementsOptions['direction'];
    maxDepth?: number;
    includeStart?: boolean;
    relationshipTypes?: RelationshipType[];
    layers?: string[];
    archimateLayers?: string[];
    elementTypes?: ElementType[];
  }; 

  const out: RelatedElementsOptions = {}; 
  if (parsed.direction) out.direction = parsed.direction; 
  if (typeof parsed.maxDepth === 'number') out.maxDepth = parsed.maxDepth; 
  if (typeof parsed.includeStart === 'boolean') out.includeStart = parsed.includeStart; 
  if (parsed.relationshipTypes && parsed.relationshipTypes.length > 0) {
    out.relationshipTypes = parsed.relationshipTypes; 
  }
  const layers = (parsed.layers && parsed.layers.length > 0 ? parsed.layers : undefined) ??
    (parsed.archimateLayers && parsed.archimateLayers.length > 0 ? parsed.archimateLayers : undefined);
  if (layers) out.layers = layers;
  if (parsed.elementTypes && parsed.elementTypes.length > 0) {
    out.elementTypes = parsed.elementTypes; 
  }
  return out; 
}

function pathsOptsFromKey(key: string): PathsBetweenOptions {
  if (!key) return {}; 
  const parsed = JSON.parse(key) as {
    direction?: PathsBetweenOptions['direction'];
    maxDepth?: number;
    maxPaths?: number;
    maxPathLength?: number;
    relationshipTypes?: RelationshipType[];
    layers?: string[];
    archimateLayers?: string[];
    elementTypes?: ElementType[];
  }; 

  const out: PathsBetweenOptions = {}; 
  if (parsed.direction) out.direction = parsed.direction; 
  if (typeof parsed.maxDepth === 'number') out.maxDepth = parsed.maxDepth; 
  if (typeof parsed.maxPaths === 'number') out.maxPaths = parsed.maxPaths; 
  if (typeof parsed.maxPathLength === 'number') out.maxPathLength = parsed.maxPathLength; 
  if (parsed.relationshipTypes && parsed.relationshipTypes.length > 0) {
    out.relationshipTypes = parsed.relationshipTypes; 
  }
  const layers = (parsed.layers && parsed.layers.length > 0 ? parsed.layers : undefined) ??
    (parsed.archimateLayers && parsed.archimateLayers.length > 0 ? parsed.archimateLayers : undefined);
  if (layers) out.layers = layers;
  if (parsed.elementTypes && parsed.elementTypes.length > 0) {
    out.elementTypes = parsed.elementTypes; 
  }
  return out; 
}

// -----------------------------
// Store-facing pure helpers
// -----------------------------

export function runAnalysisRelatedElements(
  model: Model | null | undefined,
  startElementId: string,
  opts: RelatedElementsOptions = {}
): RelatedElementsResult {
  if (!model) return { startElementId, hits: [] }; 
  return queryRelatedElements(model, startElementId, opts); 
}

export function runAnalysisPathsBetween(
  model: Model | null | undefined,
  sourceElementId: string,
  targetElementId: string,
  opts: PathsBetweenOptions = {}
): PathsBetweenResult {
  if (!model) return { sourceElementId, targetElementId, paths: [] }; 
  return queryPathsBetween(model, sourceElementId, targetElementId, opts); 
}

// -----------------------------
// Store-facing React hooks
// -----------------------------

export function useAnalysisRelatedElements(
  startElementId: string | null | undefined,
  opts: RelatedElementsOptions = {}
): RelatedElementsResult | null {
  const model = useModelStore((s) => s.model);
  const key = stableAnalysisKey(opts);
  const normalizedOpts = useMemo(() => relatedOptsFromKey(key), [key]);

  return useMemo(() => {
    if (!model || !startElementId) return null;
    return queryRelatedElements(model, startElementId, normalizedOpts);
  }, [model, startElementId, normalizedOpts]);
}

export function useAnalysisPathsBetween(
  sourceElementId: string | null | undefined,
  targetElementId: string | null | undefined,
  opts: PathsBetweenOptions = {}
): PathsBetweenResult | null {
  const model = useModelStore((s) => s.model);
  const key = stableAnalysisKey(opts);
  const normalizedOpts = useMemo(() => pathsOptsFromKey(key), [key]);

  return useMemo(() => {
    if (!model || !sourceElementId || !targetElementId) return null;
    return queryPathsBetween(model, sourceElementId, targetElementId, normalizedOpts);
  }, [model, sourceElementId, targetElementId, normalizedOpts]);
}

// -----------------------------
// Convenience option helpers (typed)
// -----------------------------

export function analysisOpts(
  partial: Partial<RelatedElementsOptions & PathsBetweenOptions> = {}
): RelatedElementsOptions & PathsBetweenOptions {
  return {
    direction: partial.direction,
    maxDepth: partial.maxDepth,
    includeStart: partial.includeStart,
    maxPaths: partial.maxPaths,
    maxPathLength: partial.maxPathLength,
    relationshipTypes: partial.relationshipTypes as RelationshipType[] | undefined,
    layers: partial.layers as string[] | undefined,
    elementTypes: partial.elementTypes as ElementType[] | undefined
  }; 
}
