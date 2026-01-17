import { useMemo } from 'react';

import type {
  ArchimateLayer,
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
  if (!opts) return '';
  const o: any = {
    direction: opts.direction,
    maxDepth: (opts as RelatedElementsOptions).maxDepth,
    includeStart: (opts as RelatedElementsOptions).includeStart,
    maxPaths: (opts as PathsBetweenOptions).maxPaths,
    maxPathLength: (opts as PathsBetweenOptions).maxPathLength,
    relationshipTypes: normalizeStringArray(opts.relationshipTypes as readonly string[] | undefined),
    archimateLayers: normalizeStringArray((opts as any).archimateLayers as readonly string[] | undefined)
  };
  return JSON.stringify(o);
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

/**
 * Compute related elements for the currently loaded model.
 *
 * Returns `null` when no model is loaded or when `startElementId` is falsy.
 */
export function useAnalysisRelatedElements(
  startElementId: string | null | undefined,
  opts: RelatedElementsOptions = {}
): RelatedElementsResult | null {
  const model = useModelStore((s) => s.model);
  const key = stableAnalysisKey(opts);

  return useMemo(() => {
    if (!model || !startElementId) return null;
    return queryRelatedElements(model, startElementId, opts);
  }, [model, startElementId, key]);
}

/**
 * Compute shortest connection paths between two elements for the currently loaded model.
 *
 * Returns `null` when no model is loaded or when either element id is falsy.
 */
export function useAnalysisPathsBetween(
  sourceElementId: string | null | undefined,
  targetElementId: string | null | undefined,
  opts: PathsBetweenOptions = {}
): PathsBetweenResult | null {
  const model = useModelStore((s) => s.model);
  const key = stableAnalysisKey(opts);

  return useMemo(() => {
    if (!model || !sourceElementId || !targetElementId) return null;
    return queryPathsBetween(model, sourceElementId, targetElementId, opts);
  }, [model, sourceElementId, targetElementId, key]);
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
    archimateLayers: partial.archimateLayers as ArchimateLayer[] | undefined
  };
}
