import type { Model, Relationship } from '../types';

export type TraceDirection = 'outgoing' | 'incoming' | 'both';

export type TraceStep = {
  depth: number;
  relationship: Relationship;
  fromId: string;
  toId: string;
};

/**
 * Computes a BFS trace over relationships starting from a given element.
 *
 * - `depthMax` is the maximum traversal depth (starting element is depth 0).
 * - Returned `TraceStep.depth` is the depth of the relationship hop (>= 1).
 */
export function computeRelationshipTrace(
  model: Model,
  startElementId: string,
  direction: TraceDirection,
  depthMax: number
): TraceStep[] {
  const steps: TraceStep[] = [];
  const visited = new Set<string>();
  visited.add(startElementId);

  type QueueItem = { elementId: string; depth: number };
  const queue: QueueItem[] = [{ elementId: startElementId, depth: 0 }];

  const relsBySource = new Map<string, Relationship[]>();
  const relsByTarget = new Map<string, Relationship[]>();

  for (const r of Object.values(model.relationships)) {
    const byS = relsBySource.get(r.sourceElementId) ?? [];
    byS.push(r);
    relsBySource.set(r.sourceElementId, byS);

    const byT = relsByTarget.get(r.targetElementId) ?? [];
    byT.push(r);
    relsByTarget.set(r.targetElementId, byT);
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    if (item.depth >= depthMax) continue;

    const nextDepth = item.depth + 1;

    if (direction === 'outgoing' || direction === 'both') {
      const out = relsBySource.get(item.elementId) ?? [];
      for (const r of out) {
        steps.push({ depth: nextDepth, relationship: r, fromId: r.sourceElementId, toId: r.targetElementId });
        if (!visited.has(r.targetElementId)) {
          visited.add(r.targetElementId);
          queue.push({ elementId: r.targetElementId, depth: nextDepth });
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const inc = relsByTarget.get(item.elementId) ?? [];
      for (const r of inc) {
        steps.push({ depth: nextDepth, relationship: r, fromId: r.targetElementId, toId: r.sourceElementId });
        if (!visited.has(r.sourceElementId)) {
          visited.add(r.sourceElementId);
          queue.push({ elementId: r.sourceElementId, depth: nextDepth });
        }
      }
    }
  }

  return steps;
}
