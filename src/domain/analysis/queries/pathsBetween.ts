import type { Model } from '../../types';
import { buildAnalysisGraph } from '../graph';
import {
  elementPassesLayerFilter,
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

function nodeAllowedForTraversal(
  model: Model,
  nodeId: string,
  layerSet: ReadonlySet<string> | undefined,
  endpoints: { sourceId: string; targetId: string }
): boolean {
  if (!layerSet) return true;
  if (nodeId === endpoints.sourceId || nodeId === endpoints.targetId) return true;
  const el = model.elements[nodeId];
  if (!el) return false;
  return elementPassesLayerFilter(el, layerSet as any);
}

function predSortKey(p: Pred): string {
  return `${p.prevId}:${p.step.relationshipId}:${p.step.relationshipType}`;
}

/**
 * Find how two elements are related (directly or indirectly) by computing up to N shortest paths.
 *
 * Semantics (v1):
 * - Relationship type + direction filters are respected.
 * - If a layer filter is provided, paths may only traverse through nodes in the allowed layers
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
      if (!nodeAllowedForTraversal(model, nextId, layerSet as any, endpoints)) continue;

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
