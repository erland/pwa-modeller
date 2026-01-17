import type { ModelKind } from '../../domain/types';
import type { AnalysisAdapter } from './AnalysisAdapter';
import { archimateAnalysisAdapter } from './archimate';

function createBasicAdapter(kind: ModelKind): AnalysisAdapter {
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
      // Default: use the graph's computed semantics.
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

const basicUmlAdapter = createBasicAdapter('uml');
const basicBpmnAdapter = createBasicAdapter('bpmn');

/**
 * Get the notation-specific Analysis adapter.
 *
 * Step 1: ArchiMate has a real adapter, others use a minimal generic fallback.
 */
export function getAnalysisAdapter(kind: ModelKind): AnalysisAdapter {
  switch (kind) {
    case 'archimate':
      return archimateAnalysisAdapter;
    case 'uml':
      return basicUmlAdapter;
    case 'bpmn':
      return basicBpmnAdapter;
    default: {
      // Exhaustive check for future kinds.
      const _never: never = kind;
      return createBasicAdapter(_never);
    }
  }
}
