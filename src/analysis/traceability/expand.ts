import type { AnalysisAdapter } from '../adapters/AnalysisAdapter';

import type { AnalysisEdge, AnalysisGraph } from '../../domain/analysis/graph';
import {
  elementPassesLayerFilter,
  elementPassesTypeFilter,
  normalizeElementTypeFilter,
  normalizeLayerFilter,
  normalizeRelationshipTypeFilter
} from '../../domain/analysis/filters';
import { getTraversalSteps } from '../../domain/analysis/traverse';
import { isExplicitlyUndirected } from '../../domain/analysis/directedness';
import type { Element, ElementType, Model, Relationship, RelationshipType } from '../../domain/types';
import type { ExpandRequest, TraceEdge, TraceExpansionPatch, TraceFrontier, TraceNode } from '../../domain/analysis/traceability/types';

function relationshipIsExplicitlyUndirected(r: Relationship): boolean {
  // Notation-agnostic: if the relationship has an attrs.isDirected flag and it is false,
  // treat it as undirected for traversal.
  return isExplicitlyUndirected(r.attrs);
}

function pushMapArray<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

/**
 * Build a traversal-friendly graph from the domain model, using adapter-directedness semantics.
 *
 * Why not reuse domain/buildAnalysisGraph?
 * - The domain builder only uses attrs.isDirected to infer undirectedness.
 * - The AnalysisAdapter can override directedness semantics per notation.
 */
export function buildAnalysisGraphWithAdapter(model: Model, adapter: AnalysisAdapter): AnalysisGraph {
  const nodes = new Map<string, Element>();
  for (const [id, el] of Object.entries(model.elements)) nodes.set(id, el);

  const outgoing = new Map<string, AnalysisEdge[]>();
  const incoming = new Map<string, AnalysisEdge[]>();

  for (const r of Object.values(model.relationships)) {
    if (!r.sourceElementId || !r.targetElementId) continue;

    // Only include edges between elements that exist in the model.
    if (!nodes.has(r.sourceElementId) || !nodes.has(r.targetElementId)) continue;

    const initiallyUndirected = relationshipIsExplicitlyUndirected(r);

    const forward: AnalysisEdge = {
      relationshipId: r.id,
      relationshipType: r.type,
      relationship: r,
      fromId: r.sourceElementId,
      toId: r.targetElementId,
      reversed: false,
      undirected: initiallyUndirected
    };

    // Let the adapter override directedness semantics.
    const undirected = initiallyUndirected || !adapter.isEdgeDirected(forward, model);
    const forwardFinal: AnalysisEdge = { ...forward, undirected };

    pushMapArray(outgoing, forwardFinal.fromId, forwardFinal);
    pushMapArray(incoming, forwardFinal.toId, forwardFinal);

    // For undirected relationships, add a synthetic reverse edge.
    if (undirected) {
      const rev: AnalysisEdge = {
        relationshipId: r.id,
        relationshipType: r.type,
        relationship: r,
        fromId: r.targetElementId,
        toId: r.sourceElementId,
        reversed: true,
        undirected
      };
      pushMapArray(outgoing, rev.fromId, rev);
      pushMapArray(incoming, rev.toId, rev);
    }
  }

  return { nodes, outgoing, incoming };
}

function edgeId(relationshipId: string, from: string, to: string): string {
  return `${relationshipId}:${from}->${to}`;
}

function addFrontier(frontier: TraceFrontier, nodeId: string, parentId: string): void {
  const cur = frontier[nodeId];
  if (!cur) {
    frontier[nodeId] = [parentId];
    return;
  }
  if (!cur.includes(parentId)) frontier[nodeId] = [...cur, parentId];
}

function normalizeStringArray(arr?: string[]): string[] | undefined {
  const cleaned = arr?.map((s) => s.trim()).filter(Boolean);
  if (!cleaned || cleaned.length === 0) return undefined;
  return cleaned;
}

function elementTypeString(el: Element): string {
  // ElementType is a string union; keep it as a string for stop conditions.
  return el.type;
}

/**
 * Expand a traceability explorer graph from a single node, returning a patch.
 *
 * Semantics (v1):
 * - Traversal respects relationship type + direction filters.
 * - Layer/type filters are applied to nodes both for inclusion *and traversal*.
 * - stopAtLayer/stopAtType stops further traversal from matched nodes (but still includes them).
 */
export function expandFromNode(model: Model, adapter: AnalysisAdapter, request: ExpandRequest): TraceExpansionPatch {
  const graph = buildAnalysisGraphWithAdapter(model, adapter);
  const start = graph.nodes.get(request.nodeId);
  if (!start) return { rootNodeId: request.nodeId, addedNodes: [], addedEdges: [], frontierByNodeId: {} };

  const maxDepth = Math.max(0, request.depth ?? 1);
  const stopAtDepth = request.stopConditions?.stopAtDepth;
  const effectiveDepth = stopAtDepth !== undefined ? Math.min(maxDepth, Math.max(0, stopAtDepth)) : maxDepth;

  const relTypeSet = normalizeRelationshipTypeFilter({ relationshipTypes: normalizeStringArray(request.relationshipTypes) as RelationshipType[] | undefined });
  const layerSet = normalizeLayerFilter({ layers: normalizeStringArray(request.layers) });
  const elTypeSet = normalizeElementTypeFilter({
    elementTypes: normalizeStringArray(request.elementTypes) as ElementType[] | undefined
  });

  const stopLayerSet = new Set(normalizeStringArray(request.stopConditions?.stopAtLayer) ?? []);
  const stopTypeSet = new Set(normalizeStringArray(request.stopConditions?.stopAtType) ?? []);

  const addedNodesById = new Map<string, TraceNode>();
  const addedEdgesById = new Map<string, TraceEdge>();
  const frontierByNodeId: TraceFrontier = {};

  // BFS within this expansion call.
  const seenDepth = new Map<string, number>();
  seenDepth.set(request.nodeId, 0);
  const queue: Array<{ id: string; depth: number }> = [{ id: request.nodeId, depth: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    if (cur.depth >= effectiveDepth) continue;

    const steps = getTraversalSteps(graph, cur.id, request.direction, relTypeSet);
    for (const s of steps) {
      const nextId = s.toId;
      const nextEl = graph.nodes.get(nextId);
      if (!nextEl) continue;

      // Apply layer/type filters for both traversal and inclusion.
      if (!elementPassesLayerFilter(nextEl, layerSet)) continue;
      if (!elementPassesTypeFilter(nextEl, elTypeSet)) continue;

      // Add edge (in traversal direction).
      const eid = edgeId(s.relationshipId, s.fromId, s.toId);
      if (!addedEdgesById.has(eid)) {
        addedEdgesById.set(eid, {
          id: eid,
          relationshipId: s.relationshipId,
          from: s.fromId,
          to: s.toId,
          type: s.relationshipType
        });
      }

      // Add node.
      if (nextId !== request.nodeId && !addedNodesById.has(nextId)) {
        addedNodesById.set(nextId, {
          id: nextId,
          depth: cur.depth + 1,
          pinned: false,
          expanded: false,
          hidden: false
        });
      }

      addFrontier(frontierByNodeId, nextId, cur.id);

      // Determine whether we should continue traversing from this node.
      const nextDepth = cur.depth + 1;
      if (nextDepth >= effectiveDepth) continue;

      // Stop conditions are checked against the element.
      const stopByLayer = nextEl.layer ? stopLayerSet.has(nextEl.layer) : false;
      const stopByType = stopTypeSet.has(elementTypeString(nextEl));
      if (stopByLayer || stopByType) continue;

      const prev = seenDepth.get(nextId);
      if (prev === undefined || nextDepth < prev) {
        seenDepth.set(nextId, nextDepth);
        queue.push({ id: nextId, depth: nextDepth });
      }
    }
  }

  return {
    rootNodeId: request.nodeId,
    addedNodes: [...addedNodesById.values()],
    addedEdges: [...addedEdgesById.values()],
    frontierByNodeId
  };
}
