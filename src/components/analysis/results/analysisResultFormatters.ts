import type { AnalysisPath, Model, TraversalStep } from '../../../domain';
import { getElementTypeLabel } from '../../../domain';
import type { AnalysisAdapter } from '../../../analysis/adapters/AnalysisAdapter';

import { docSnippet, edgeFromStep, stringFacetValue } from './analysisResultHelpers';

export type AnalysisResultFormatters = {
  elementTooltip: (elementId: string) => { title: string; lines: string[] } | null;
  nodeLabel: (id: string) => string;
  nodeType: (id: string) => string;
  nodeLayer: (id: string) => string;
  stepSummary: (s: TraversalStep) => string;
  pathTitle: (p: AnalysisPath) => string;
};

export function createAnalysisResultFormatters(adapter: AnalysisAdapter, model: Model): AnalysisResultFormatters {
  const elementTooltip = (elementId: string): { title: string; lines: string[] } | null => {
    const el = model.elements[elementId];
    if (!el) return null;
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? el.layer) ?? '');
    const doc = docSnippet(el.documentation);
    const lines: string[] = [];
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc}`);
    return { title: el.name || '(unnamed)', lines };
  };

  const nodeLabel = (id: string): string => {
    const el = model.elements[id];
    if (!el) return '(missing)';
    return adapter.getNodeLabel(el, model);
  };

  const nodeType = (id: string): string => {
    const el = model.elements[id];
    if (!el) return '';
    const facets = adapter.getNodeFacetValues(el, model);
    const rawType = String((facets.type ?? facets.elementType ?? el.type) ?? '');
    return rawType ? getElementTypeLabel(rawType) : '';
  };

  const nodeLayer = (id: string): string => {
    const el = model.elements[id];
    if (!el) return '';
    const facets = adapter.getNodeFacetValues(el, model);
    return stringFacetValue(facets.archimateLayer ?? el.layer ?? '');
  };

  const edgeLabel = (s: TraversalStep): string => adapter.getEdgeLabel(edgeFromStep(s), model);
  const edgeIsDirected = (s: TraversalStep): boolean => adapter.isEdgeDirected(edgeFromStep(s), model);

  const stepSummary = (s: TraversalStep): string => {
    const from = nodeLabel(s.fromId);
    const to = nodeLabel(s.toId);
    const rel = edgeLabel(s);
    const directed = edgeIsDirected(s);
    const arrow = directed ? '→' : '—';
    const rev = s.reversed && directed ? ' (reversed)' : '';
    return `${from} —[${rel}]${arrow} ${to}${rev}`;
  };

  const pathTitle = (p: AnalysisPath): string => {
    const a = nodeLabel(p.elementIds[0] || '');
    const b = nodeLabel(p.elementIds[p.elementIds.length - 1] || '');
    const hops = Math.max(0, p.elementIds.length - 1);
    return `${a} → ${b} (${hops} hops)`;
  };

  return { elementTooltip, nodeLabel, nodeType, nodeLayer, stepSummary, pathTitle };
}
