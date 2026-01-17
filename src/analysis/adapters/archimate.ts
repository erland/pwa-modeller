import type { AnalysisEdge } from '../../domain/analysis/graph';
import type { Element, Model, RelationshipAttributes } from '../../domain/types';
import type { AnalysisAdapter, AnalysisFacetDefinition, AnalysisFacetValues } from './AnalysisAdapter';

function elementTypeLabel(el: Element): string {
  if (el.type !== 'Unknown') return el.type;
  return el.unknownType?.name ? `Unknown: ${el.unknownType.name}` : 'Unknown';
}

function relationshipTypeLabel(edge: AnalysisEdge): string {
  const r = edge.relationship;
  if (r.type !== 'Unknown') return r.type;
  return r.unknownType?.name ? `Unknown: ${r.unknownType.name}` : 'Unknown';
}

function isUndirectedAssociation(edge: AnalysisEdge, model: Model): boolean {
  const r = model.relationships[edge.relationshipId] ?? edge.relationship;
  if (r.type !== 'Association') return false;
  const attrs = (r.attrs ?? undefined) as RelationshipAttributes | undefined;
  return attrs?.isDirected === false;
}

function resolveElement(node: Element, model: Model): Element {
  // Prefer the canonical instance from the model (stable for UI/tests), but fall back to the provided node.
  return model.elements[node.id] ?? node;
}

const facetDefinitions: AnalysisFacetDefinition[] = [
  { id: 'type', label: 'Type', kind: 'single' }
];

export const archimateAnalysisAdapter: AnalysisAdapter = {
  id: 'archimate',

  getNodeLabel(node: Element, model: Model): string {
    const el = resolveElement(node, model);
    // Keep it stable (matches other parts of the UI): name (Type)
    return `${el.name} (${elementTypeLabel(el)})`;
  },

  getEdgeLabel(edge: AnalysisEdge, model: Model): string {
    // Touch model to keep semantics consistent if relationship objects get replaced.
    const r = model.relationships[edge.relationshipId];
    return relationshipTypeLabel({ ...edge, relationship: r ?? edge.relationship });
  },

  isEdgeDirected(edge: AnalysisEdge, model: Model): boolean {
    // The analysis graph currently treats Associations with attrs.isDirected === false as undirected.
    // Preserve that behavior here.
    if (edge.undirected) return false;
    return !isUndirectedAssociation(edge, model);
  },

  getFacetDefinitions(model: Model): AnalysisFacetDefinition[] {
    // Model is currently unused, but keeping it in the signature allows future adapters
    // to derive facets from model config. Touch it to satisfy noUnusedParameters.
    void model;
    return facetDefinitions;
  },

  getNodeFacetValues(node: Element, model: Model): AnalysisFacetValues {
    const el = resolveElement(node, model);
    return {
      type: elementTypeLabel(el)
    };
  }
};
