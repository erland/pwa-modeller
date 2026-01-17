import type { Model } from '../../types';
import { buildAnalysisGraph } from '../graph';
import {
  elementPassesLayerFilter,
  normalizeLayerFilter,
  normalizeRelationshipTypeFilter
} from '../filters';
import type { RelatedElementsOptions } from '../filters';
import { getTraversalSteps, type TraversalStep } from '../traverse';

export type RelatedElementHit = {
  elementId: string;
  distance: number;
  /** A single shortest-path predecessor step (useful for drill-down). */
  via?: TraversalStep;
};

export type RelatedElementsResult = {
  startElementId: string;
  hits: RelatedElementHit[];
};

function safeLocaleCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Compute all elements related to the start element (directly or indirectly) up to a maximum depth.
 *
 * Semantics (v1):
 * - Traversal respects relationship type + direction filters.
 * - Layer filter is applied to the *returned hits*, but traversal is allowed to pass through excluded nodes.
 */
export function queryRelatedElements(model: Model, startElementId: string, opts: RelatedElementsOptions = {}): RelatedElementsResult {
  const graph = buildAnalysisGraph(model);
  const start = graph.nodes.get(startElementId);
  if (!start) return { startElementId, hits: [] };

  const direction = opts.direction ?? 'both';
  const maxDepth = opts.maxDepth ?? 4;
  const includeStart = opts.includeStart ?? false;

  const typeSet = normalizeRelationshipTypeFilter(opts);
  const layerSet = normalizeLayerFilter(opts);

  const distance = new Map<string, number>();
  const via = new Map<string, TraversalStep>();

  distance.set(startElementId, 0);
  const queue: string[] = [startElementId];

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const d = distance.get(current);
    if (d === undefined) continue;
    if (d >= maxDepth) continue;

    const steps = getTraversalSteps(graph, current, direction, typeSet);
    for (const s of steps) {
      const nextId = s.toId;
      if (!distance.has(nextId)) {
        distance.set(nextId, d + 1);
        via.set(nextId, s);
        queue.push(nextId);
      }
    }
  }

  const hits: RelatedElementHit[] = [];

  for (const [id, d] of distance.entries()) {
    if (id === startElementId) {
      if (includeStart) hits.push({ elementId: id, distance: 0 });
      continue;
    }

    const el = graph.nodes.get(id);
    if (!el) continue;
    if (!elementPassesLayerFilter(el, layerSet)) continue;

    hits.push({ elementId: id, distance: d, via: via.get(id) });
  }

  hits.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    const an = graph.nodes.get(a.elementId)?.name ?? '';
    const bn = graph.nodes.get(b.elementId)?.name ?? '';
    const c = safeLocaleCompare(an, bn);
    if (c !== 0) return c;
    return a.elementId.localeCompare(b.elementId);
  });

  return { startElementId, hits };
}
