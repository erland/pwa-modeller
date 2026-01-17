import type { RelationshipType } from '../types';
import type { AnalysisDirection } from './filters';
import type { AnalysisEdge, AnalysisGraph } from './graph';

export type TraversalStep = {
  relationshipId: string;
  relationshipType: RelationshipType;
  relationship: AnalysisEdge['relationship'];
  /** From element id in the *traversal* direction. */
  fromId: string;
  /** To element id in the *traversal* direction. */
  toId: string;
  /** True when traversing against the relationship's stored direction (only relevant for directed relationships). */
  reversed: boolean;
};

function stepKey(s: TraversalStep): string {
  return `${s.relationshipId}:${s.fromId}->${s.toId}`;
}

function edgesOutgoing(graph: AnalysisGraph, nodeId: string): AnalysisEdge[] {
  return graph.outgoing.get(nodeId) ?? [];
}

function edgesIncoming(graph: AnalysisGraph, nodeId: string): AnalysisEdge[] {
  return graph.incoming.get(nodeId) ?? [];
}

/**
 * Return traversal steps from a node, respecting direction.
 *
 * - For `outgoing`, steps follow relationship direction.
 * - For `incoming`, steps traverse *against* relationship direction.
 * - For `both`, returns a de-duplicated union.
 */
export function getTraversalSteps(
  graph: AnalysisGraph,
  nodeId: string,
  direction: AnalysisDirection,
  allowedRelationshipTypes?: ReadonlySet<RelationshipType>
): TraversalStep[] {
  const out: TraversalStep[] = [];
  const seen = new Set<string>();

  const push = (s: TraversalStep) => {
    const k = stepKey(s);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };

  if (direction === 'outgoing' || direction === 'both') {
    for (const e of edgesOutgoing(graph, nodeId)) {
      if (allowedRelationshipTypes && !allowedRelationshipTypes.has(e.relationshipType)) continue;
      push({
        relationshipId: e.relationshipId,
        relationshipType: e.relationshipType,
        relationship: e.relationship,
        fromId: nodeId,
        toId: e.toId,
        // Synthetic reverse edges only exist for undirected relationships; treat as not reversed.
        reversed: false
      });
    }
  }

  if (direction === 'incoming' || direction === 'both') {
    for (const e of edgesIncoming(graph, nodeId)) {
      if (allowedRelationshipTypes && !allowedRelationshipTypes.has(e.relationshipType)) continue;
      // Incoming traversal follows the relationship *backwards* (nodeId -> e.fromId)
      push({
        relationshipId: e.relationshipId,
        relationshipType: e.relationshipType,
        relationship: e.relationship,
        fromId: nodeId,
        toId: e.fromId,
        reversed: !e.undirected
      });
    }
  }

  return out;
}
