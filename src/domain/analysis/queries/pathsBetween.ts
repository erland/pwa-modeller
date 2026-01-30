import type { ElementType, Model } from '../../types';
import { buildAnalysisGraph } from '../graph';
import {
  elementPassesLayerFilter,
  elementPassesTypeFilter,
  normalizeElementTypeFilter,
  normalizeLayerFilter,
  normalizeRelationshipTypeFilter
} from '../filters';
import type { PathsBetweenOptions } from '../filters';
import { getTraversalSteps, type TraversalStep } from '../traverse';

export type AnalysisPath = {
  /** Elements from source to target (inclusive). */
  elementIds: string[];
  /** Steps (relationships) from source to target. */
  steps: TraversalStep[];
};

export type PathsBetweenResult = {
  sourceElementId: string;
  targetElementId: string;
  /** The shortest distance found (in hops), if any path exists. */
  shortestDistance?: number;
  paths: AnalysisPath[];
};

type Pred = { prevId: string; step: TraversalStep };

function traversalStepKey(s: TraversalStep): string {
  // Keep this consistent with the step key used for de-duplication in traverse.ts.
  return `${s.relationshipId}:${s.fromId}->${s.toId}`;
}

function traversalStepSortKey(s: TraversalStep): string {
  // Deterministic ordering for BFS exploration.
  // Prefer stable ordering by destination, then relationship identifiers.
  return `${s.toId}:${s.relationshipId}:${s.relationshipType}:${s.reversed ? '1' : '0'}`;
}

function nodeAllowedForTraversal(
  model: Model,
  nodeId: string,
  layerSet: ReadonlySet<string> | undefined,
  elementTypeSet: ReadonlySet<ElementType> | undefined,
  endpoints: { sourceId: string; targetId: string }
): boolean {
  if (!layerSet && !elementTypeSet) return true;
  if (nodeId === endpoints.sourceId || nodeId === endpoints.targetId) return true;
  const el = model.elements[nodeId];
  if (!el) return false;
  if (!elementPassesLayerFilter(el, layerSet)) return false;
  if (!elementPassesTypeFilter(el, elementTypeSet)) return false;
  return true;
}

function predSortKey(p: Pred): string {
  return `${p.prevId}:${p.step.relationshipId}:${p.step.relationshipType}`;
}

export type BannedTraversal = {
  /** Elements that must not be visited by the BFS. */
  bannedNodeIds?: ReadonlySet<string>;
  /** Traversal steps that must not be used, keyed by `${relationshipId}:${fromId}->${toId}`. */
  bannedStepKeys?: ReadonlySet<string>;
};

/**
 * Find a *single* shortest path between two elements.
 *
 * This helper is intended for future K-shortest-paths implementations (e.g., Yen),
 * where we repeatedly compute shortest paths while temporarily banning nodes/edges.
 *
 * - Uses BFS (unweighted graph).
 * - Respects the same filters as {@link queryPathsBetween}.
 * - Returns one deterministic shortest path (based on stable traversal ordering).
 */
export function findShortestSinglePathWithBans(
  model: Model,
  sourceElementId: string,
  targetElementId: string,
  opts: PathsBetweenOptions = {},
  bans: BannedTraversal = {}
): AnalysisPath | undefined {
  const graph = buildAnalysisGraph(model);
  if (!graph.nodes.has(sourceElementId) || !graph.nodes.has(targetElementId)) return undefined;

  const bannedNodeIds = bans.bannedNodeIds;
  const bannedStepKeys = bans.bannedStepKeys;
  if (bannedNodeIds?.has(sourceElementId) || bannedNodeIds?.has(targetElementId)) return undefined;

  if (sourceElementId === targetElementId) {
    return { elementIds: [sourceElementId], steps: [] };
  }

  const direction = opts.direction ?? 'both';
  const typeSet = normalizeRelationshipTypeFilter(opts);
  const layerSet = normalizeLayerFilter(opts);
  const elementTypeSet = normalizeElementTypeFilter(opts);
  const endpoints = { sourceId: sourceElementId, targetId: targetElementId };

  const dist = new Map<string, number>();
  const prev = new Map<string, Pred>();
  const queue: string[] = [];

  dist.set(sourceElementId, 0);
  queue.push(sourceElementId);

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;

    const d = dist.get(current);
    if (d === undefined) continue;

    const steps = getTraversalSteps(graph, current, direction, typeSet)
      .filter(s => !bannedStepKeys?.has(traversalStepKey(s)))
      .filter(s => !bannedNodeIds?.has(s.toId))
      .sort((a, b) => traversalStepSortKey(a).localeCompare(traversalStepSortKey(b)));

    for (const s of steps) {
      const nextId = s.toId;
      const nd = d + 1;

      if (opts.maxPathLength !== undefined && nd > opts.maxPathLength) continue;
      if (!nodeAllowedForTraversal(model, nextId, layerSet, elementTypeSet, endpoints)) continue;

      if (!dist.has(nextId)) {
        dist.set(nextId, nd);
        prev.set(nextId, { prevId: current, step: s });

        if (nextId === targetElementId) {
          // BFS ensures this is the shortest distance; deterministic step ordering
          // ensures stable choice among equal-length alternatives.
          queue.length = 0;
          break;
        }

        queue.push(nextId);
      }
    }
  }

  if (!prev.has(targetElementId)) return undefined;

  const elementIdsRev: string[] = [targetElementId];
  const stepsRev: TraversalStep[] = [];
  let cur = targetElementId;
  while (cur !== sourceElementId) {
    const p = prev.get(cur);
    if (!p) return undefined;
    stepsRev.push(p.step);
    elementIdsRev.push(p.prevId);
    cur = p.prevId;
  }

  return {
    elementIds: elementIdsRev.reverse(),
    steps: stepsRev.reverse()
  };
}

/**
 * Find how two elements are related (directly or indirectly) by computing up to N shortest paths.
 *
 * Semantics (v1):
 * - Relationship type + direction filters are respected.
 * - If a layer filter is provided, paths may only traverse through nodes in the allowed layer values
 *   (except the two endpoints, which are always allowed).
 */
export function queryPathsBetween(
  model: Model,
  sourceElementId: string,
  targetElementId: string,
  opts: PathsBetweenOptions = {}
): PathsBetweenResult {
  const graph = buildAnalysisGraph(model);
  if (!graph.nodes.has(sourceElementId) || !graph.nodes.has(targetElementId)) {
    return { sourceElementId, targetElementId, paths: [] };
  }

  const direction = opts.direction ?? 'both';
  const maxPaths = opts.maxPaths ?? 10;
  const typeSet = normalizeRelationshipTypeFilter(opts);
  const layerSet = normalizeLayerFilter(opts);
  const elementTypeSet = normalizeElementTypeFilter(opts);

  const endpoints = { sourceId: sourceElementId, targetId: targetElementId };

  const dist = new Map<string, number>();
  const preds = new Map<string, Pred[]>();
  const queue: string[] = [];

  dist.set(sourceElementId, 0);
  queue.push(sourceElementId);

  let foundDistance: number | undefined;

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;

    const d = dist.get(current);
    if (d === undefined) continue;

    // Once target is reached, we only care about nodes with distance < foundDistance.
    if (foundDistance !== undefined && d >= foundDistance) continue;

    const steps = getTraversalSteps(graph, current, direction, typeSet);
    for (const s of steps) {
      const nextId = s.toId;
      const nd = d + 1;

      if (opts.maxPathLength !== undefined && nd > opts.maxPathLength) continue;
      if (!nodeAllowedForTraversal(model, nextId, layerSet, elementTypeSet, endpoints)) continue;

      const prevDist = dist.get(nextId);
      if (prevDist === undefined) {
        dist.set(nextId, nd);
        preds.set(nextId, [{ prevId: current, step: s }]);
        queue.push(nextId);
      } else if (prevDist === nd) {
        const arr = preds.get(nextId) ?? [];
        arr.push({ prevId: current, step: s });
        preds.set(nextId, arr);
      }

      if (nextId === targetElementId) {
        foundDistance = dist.get(targetElementId) ?? nd;
      }
    }
  }

  const shortest = dist.get(targetElementId);
  if (shortest === undefined) return { sourceElementId, targetElementId, paths: [] };

  // Sort predecessor lists to make path output deterministic.
  for (const [k, arr] of preds.entries()) {
    arr.sort((a, b) => predSortKey(a).localeCompare(predSortKey(b)));
    preds.set(k, arr);
  }

  const paths: AnalysisPath[] = [];

  type StackItem = { nodeId: string; stepsRev: TraversalStep[]; elIdsRev: string[] };
  const stack: StackItem[] = [{ nodeId: targetElementId, stepsRev: [], elIdsRev: [targetElementId] }];

  while (stack.length && paths.length < maxPaths) {
    const item = stack.pop();
    if (!item) break;

    if (item.nodeId === sourceElementId) {
      const steps = item.stepsRev.slice().reverse();
      const elementIds = item.elIdsRev.slice().reverse();
      paths.push({ elementIds, steps });
      continue;
    }

    const prevs = preds.get(item.nodeId) ?? [];
    for (const p of prevs) {
      // build reversed lists (target -> source)
      stack.push({
        nodeId: p.prevId,
        stepsRev: item.stepsRev.concat([p.step]),
        elIdsRev: item.elIdsRev.concat([p.prevId])
      });
    }
  }

  return { sourceElementId, targetElementId, shortestDistance: shortest, paths };
}


// NOTE: This is intentionally a thin wrapper around queryPathsBetween.
// It exists to allow the analysis workspace to opt into "Top-K" (potentially longer) paths
// in a future change, without altering the semantics of queryPathsBetween.
export type KShortestPathsBetweenOptions = PathsBetweenOptions;

type YenCandidate = {
  path: AnalysisPath;
  cost: number;
  sortKey: string;
};

function analysisPathKey(p: AnalysisPath): string {
  // Deterministic key used for de-duplication + stable ordering.
  // Include both elements and traversal steps to disambiguate otherwise identical node sequences.
  const els = p.elementIds.join('>');
  const steps = p.steps.map(traversalStepKey).join('|');
  return `${els}#${steps}`;
}

function yenCandidateSortKey(p: AnalysisPath): string {
  // Primary: hop count (cost). Secondary: deterministic path key.
  const cost = p.steps.length;
  // Pad to keep lexicographic ordering stable.
  const costKey = String(cost).padStart(6, '0');
  return `${costKey}:${analysisPathKey(p)}`;
}

function pathHasPrefix(p: AnalysisPath, rootElementIds: readonly string[]): boolean {
  if (p.elementIds.length < rootElementIds.length) return false;
  for (let i = 0; i < rootElementIds.length; i++) {
    if (p.elementIds[i] !== rootElementIds[i]) return false;
  }
  return true;
}

/**
 * Find up to K shortest simple paths between two elements.
 *
 * Semantics:
 * - Uses Yen's algorithm on an unweighted graph (BFS for each shortest-path sub-problem).
 * - Respects the same traversal filters as {@link queryPathsBetween}.
 * - Returned paths are simple (no repeated nodes).
 * - Results are ordered by hop count (shorter first) with deterministic tie-breaking.
 */
export function queryKShortestPathsBetween(
  model: Model,
  sourceElementId: string,
  targetElementId: string,
  opts: KShortestPathsBetweenOptions = {}
): PathsBetweenResult {
  const maxPaths = opts.maxPaths ?? 10;
  if (maxPaths <= 0) return { sourceElementId, targetElementId, paths: [] };

  const first = findShortestSinglePathWithBans(model, sourceElementId, targetElementId, opts, {});
  if (!first) return { sourceElementId, targetElementId, paths: [] };

  // Yen's algorithm uses A for best paths and B for candidates.
  const A: AnalysisPath[] = [first];
  const bestKeySet = new Set<string>([analysisPathKey(first)]);

  const B: YenCandidate[] = [];
  const candidateKeySet = new Set<string>();

  const shortestDistance = first.steps.length;

  const pushCandidate = (p: AnalysisPath): void => {
    const k = analysisPathKey(p);
    if (bestKeySet.has(k) || candidateKeySet.has(k)) return;
    const cand: YenCandidate = { path: p, cost: p.steps.length, sortKey: yenCandidateSortKey(p) };
    B.push(cand);
    candidateKeySet.add(k);
  };

  for (let k = 1; k < maxPaths; k++) {
    const prevPath = A[k - 1];
    if (!prevPath) break;

    // The spur node can be any node in the previous best path except the target.
    for (let i = 0; i < prevPath.elementIds.length - 1; i++) {
      const rootElementIds = prevPath.elementIds.slice(0, i + 1);
      const rootSteps = prevPath.steps.slice(0, i);
      const spurNodeId = rootElementIds[rootElementIds.length - 1];

      // Ban all nodes in the root path except the spur node to ensure simplicity.
      const bannedNodeIds = new Set<string>(rootElementIds.slice(0, -1));

      // Ban the edge that would recreate any previously found path that shares this root.
      const bannedStepKeys = new Set<string>();
      for (const p of A) {
        if (!pathHasPrefix(p, rootElementIds)) continue;
        const stepAfterRoot = p.steps[i];
        if (stepAfterRoot) bannedStepKeys.add(traversalStepKey(stepAfterRoot));
      }

      // If caller specified an absolute maxPathLength, adjust for the already-fixed root prefix.
      const remainingMax =
        opts.maxPathLength === undefined ? undefined : Math.max(0, opts.maxPathLength - rootSteps.length);
      if (remainingMax !== undefined && remainingMax === 0 && spurNodeId !== targetElementId) {
        continue;
      }

      const spurOpts: PathsBetweenOptions =
        remainingMax === undefined ? opts : { ...opts, maxPathLength: remainingMax };

      const spurPath = findShortestSinglePathWithBans(
        model,
        spurNodeId,
        targetElementId,
        spurOpts,
        { bannedNodeIds, bannedStepKeys }
      );
      if (!spurPath) continue;

      // Combine root + spur, avoiding duplicate spur node.
      const combinedElementIds = rootElementIds.slice(0, -1).concat(spurPath.elementIds);
      const combinedSteps = rootSteps.concat(spurPath.steps);

      // Respect the absolute maxPathLength if provided.
      if (opts.maxPathLength !== undefined && combinedSteps.length > opts.maxPathLength) continue;

      pushCandidate({ elementIds: combinedElementIds, steps: combinedSteps });
    }

    if (!B.length) break;

    // Pick best candidate deterministically.
    B.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const next = B.shift();
    if (!next) break;
    candidateKeySet.delete(analysisPathKey(next.path));

    A.push(next.path);
    bestKeySet.add(analysisPathKey(next.path));
  }

  return {
    sourceElementId,
    targetElementId,
    shortestDistance,
    paths: A
  };
}
