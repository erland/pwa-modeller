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
import { queryKShortestPathsBetween, queryPathsBetween, queryRelatedElements } from '../domain';
import { useModelStore } from './hooks';

export type PathsBetweenQueryMode = 'shortest' | 'kShortest';

// -----------------------------
// Query safety caps + caching
// -----------------------------

const HARD_MAX_KSHORTEST_PATHS = 25;
const HARD_MAX_KSHORTEST_PATH_LENGTH = 50;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clampPathsOptsForMode(
  opts: PathsBetweenOptions,
  mode: PathsBetweenQueryMode
): PathsBetweenOptions {
  if (mode !== 'kShortest') return opts;

  const next: PathsBetweenOptions = { ...opts };

  // Safety: prevent pathological runtimes from very large K or extremely long paths.
  if (next.maxPaths !== undefined) {
    next.maxPaths = clampInt(next.maxPaths, 0, HARD_MAX_KSHORTEST_PATHS);
  } else {
    next.maxPaths = clampInt(10, 0, HARD_MAX_KSHORTEST_PATHS);
  }

  // Even if the user selects "No cap" in the UI, keep a hard guardrail to avoid worst-case blowups.
  if (next.maxPathLength !== undefined) {
    next.maxPathLength = clampInt(next.maxPathLength, 0, HARD_MAX_KSHORTEST_PATH_LENGTH);
  } else {
    next.maxPathLength = HARD_MAX_KSHORTEST_PATH_LENGTH;
  }

  return next;
}

const relatedCache = new WeakMap<Model, Map<string, RelatedElementsResult>>();
const pathsCache = new WeakMap<Model, Map<string, PathsBetweenResult>>();

function getModelCache<T>(
  wm: WeakMap<Model, Map<string, T>>,
  model: Model
): Map<string, T> {
  const existing = wm.get(model);
  if (existing) return existing;
  const m = new Map<string, T>();
  wm.set(model, m);
  return m;
}

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

function stablePathsBetweenKey(opts: PathsBetweenOptions | undefined, mode: PathsBetweenQueryMode): string {
  // Keep the same key shape as `stableAnalysisKey` (direction/maxDepth/etc),
  // but add the mode so memoization doesn't cross-contaminate shortest vs k-shortest.
  const baseKey = stableAnalysisKey(opts);
  const base = baseKey ? (JSON.parse(baseKey) as Record<string, unknown>) : {};
  return JSON.stringify({ ...base, pathMode: mode });
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

  const optsKey = stableAnalysisKey(opts);
  const cacheKey = `${startElementId}|${optsKey}`;
  const cache = getModelCache(relatedCache, model);

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const normalizedOpts = relatedOptsFromKey(optsKey);
  const result = queryRelatedElements(model, startElementId, normalizedOpts);
  cache.set(cacheKey, result);
  return result;
}

export function runAnalysisPathsBetween(
  model: Model | null | undefined,
  sourceElementId: string,
  targetElementId: string,
  opts: PathsBetweenOptions = {},
  mode: PathsBetweenQueryMode = 'shortest'
): PathsBetweenResult {
  if (!model) return { sourceElementId, targetElementId, paths: [] };

  const userKey = stablePathsBetweenKey(opts, mode);
  const normalizedOpts = pathsOptsFromKey(userKey);
  const safeOpts = clampPathsOptsForMode(normalizedOpts, mode);
  const safeKey = stablePathsBetweenKey(safeOpts, mode);

  const cacheKey = `${sourceElementId}|${targetElementId}|${safeKey}`;
  const cache = getModelCache(pathsCache, model);

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result =
    mode === 'kShortest'
      ? queryKShortestPathsBetween(model, sourceElementId, targetElementId, safeOpts)
      : queryPathsBetween(model, sourceElementId, targetElementId, normalizedOpts);

  cache.set(cacheKey, result);
  return result;
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

    const cacheKey = `${startElementId}|${key}`;
    const cache = getModelCache(relatedCache, model);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = queryRelatedElements(model, startElementId, normalizedOpts);
    cache.set(cacheKey, result);
    return result;
  }, [model, startElementId, normalizedOpts, key]);
}

export function useAnalysisPathsBetween(
  sourceElementId: string | null | undefined,
  targetElementId: string | null | undefined,
  opts: PathsBetweenOptions = {},
  mode: PathsBetweenQueryMode = 'shortest'
): PathsBetweenResult | null {
  const model = useModelStore((s) => s.model);

  const userKey = stablePathsBetweenKey(opts, mode);
  const normalizedOpts = useMemo(() => pathsOptsFromKey(userKey), [userKey]);

  const safeOpts = useMemo(() => clampPathsOptsForMode(normalizedOpts, mode), [normalizedOpts, mode]);
  const safeKey = useMemo(() => stablePathsBetweenKey(safeOpts, mode), [safeOpts, mode]);

  return useMemo(() => {
    if (!model || !sourceElementId || !targetElementId) return null;

    const cacheKey = `${sourceElementId}|${targetElementId}|${safeKey}`;
    const cache = getModelCache(pathsCache, model);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result =
      mode === 'kShortest'
        ? queryKShortestPathsBetween(model, sourceElementId, targetElementId, safeOpts)
        : queryPathsBetween(model, sourceElementId, targetElementId, normalizedOpts);

    cache.set(cacheKey, result);
    return result;
  }, [model, sourceElementId, targetElementId, normalizedOpts, safeOpts, safeKey, mode]);
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
