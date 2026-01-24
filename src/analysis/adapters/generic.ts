import type { ModelKind } from '../../domain/types';
import { getElementTypeLabel, getRelationshipTypeLabel } from '../../domain';
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
      return el.name && String(el.name).trim() ? String(el.name) : '(unnamed)';
    },
    getEdgeLabel(edge, model) {
      const r = model.relationships[edge.relationshipId] ?? edge.relationship;
      if (r.type !== 'Unknown') return getRelationshipTypeLabel(r.type);
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
      const el = model.elements[node.id] ?? node;
      const typeLabel =
        el.type === 'Unknown'
          ? el.unknownType?.name
            ? `Unknown: ${el.unknownType.name}`
            : 'Unknown'
          : getElementTypeLabel(el.type);
      return {
        type: typeLabel,
        elementType: el.type
      };
    }
  };
}
