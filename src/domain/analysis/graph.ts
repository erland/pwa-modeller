import type { RelationshipAttributes } from '../types';
import type { Element, Model, Relationship, RelationshipType } from '../types';

export type AnalysisEdge = {
  relationshipId: string;
  relationshipType: RelationshipType;
  relationship: Relationship;
  /** Traversal direction for this edge entry. */
  fromId: string;
  toId: string;
  /** True if this edge is a synthetic reverse edge (only created for undirected relationships). */
  reversed: boolean;
  /** True if the underlying relationship should be treated as undirected. */
  undirected: boolean;
};

export type AnalysisGraph = {
  nodes: Map<string, Element>;
  outgoing: Map<string, AnalysisEdge[]>;
  incoming: Map<string, AnalysisEdge[]>;
};

function isUndirectedRelationship(r: Relationship): boolean {
  if (r.type !== 'Association') return false;
  const attrs = (r.attrs ?? undefined) as RelationshipAttributes | undefined;
  return attrs?.isDirected === false;
}

function pushMapArray<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

/**
 * Build a traversal-friendly graph from the domain model.
 *
 * Notes:
 * - v1 focuses on element-to-element relationships only.
 * - Relationships to/from connectors are ignored for now.
 */
export function buildAnalysisGraph(model: Model): AnalysisGraph {
  const nodes = new Map<string, Element>();
  for (const [id, el] of Object.entries(model.elements)) nodes.set(id, el);

  const outgoing = new Map<string, AnalysisEdge[]>();
  const incoming = new Map<string, AnalysisEdge[]>();

  for (const r of Object.values(model.relationships)) {
    if (!r.sourceElementId || !r.targetElementId) continue;

    // Only include edges between elements that exist in the model.
    if (!nodes.has(r.sourceElementId) || !nodes.has(r.targetElementId)) continue;

    const undirected = isUndirectedRelationship(r);

    const forward: AnalysisEdge = {
      relationshipId: r.id,
      relationshipType: r.type,
      relationship: r,
      fromId: r.sourceElementId,
      toId: r.targetElementId,
      reversed: false,
      undirected
    };

    pushMapArray(outgoing, forward.fromId, forward);
    pushMapArray(incoming, forward.toId, forward);

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
