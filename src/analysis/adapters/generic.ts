import type { ModelKind } from '../../domain/types';
import type { AnalysisAdapter } from './AnalysisAdapter';

/**
 * Generic, notation-agnostic Analysis adapter.
 *
 * Intended as a safe baseline for notations where we haven't implemented
 * richer, notation-specific labels/facets yet.
 */
export function createGenericAnalysisAdapter(kind: ModelKind): AnalysisAdapter {
  return {
    id: kind,
    getNodeLabel(node, model) {
      const el = model.elements[node.id] ?? node;
      const typeLabel =
        el.type === 'Unknown'
          ? el.unknownType?.name
            ? `Unknown: ${el.unknownType.name}`
            : 'Unknown'
          : el.type;
      return `${el.name} (${typeLabel})`;
    },
    getEdgeLabel(edge, model) {
      const r = model.relationships[edge.relationshipId] ?? edge.relationship;
      if (r.type !== 'Unknown') return r.type;
      return r.unknownType?.name ? `Unknown: ${r.unknownType.name}` : 'Unknown';
    },
    isEdgeDirected(edge, model) {
      // Default: use the analysis graph's computed semantics.
      void model;
      return !edge.undirected;
    },
    getFacetDefinitions(model) {
      // No facets by default.
      void model;
      return [];
    },
    getNodeFacetValues(node, model) {
      // No facet values by default.
      void node;
      void model;
      return {};
    }
  };
}
