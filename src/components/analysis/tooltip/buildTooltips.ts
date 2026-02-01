import type { Model, TraversalStep } from '../../../domain';
import { getElementTypeLabel, getRelationshipTypeLabel } from '../../../domain';
import type { AnalysisAdapter } from '../../../analysis/adapters/AnalysisAdapter';

import { docSnippet, edgeFromStep, stringFacetValue } from '../results/analysisResultHelpers';

export type AnalysisTooltip = { title: string; lines: string[] };

export function buildElementTooltip(adapter: AnalysisAdapter, model: Model, elementId: string): AnalysisTooltip | null {
  const el = model.elements[elementId];
  if (!el) return null;

  const facets = adapter.getNodeFacetValues(el, model);

  const rawType = String((facets.elementType ?? facets.type ?? el.type) ?? '');
  const typeLabel = rawType ? getElementTypeLabel(rawType) : '';

  const layer = stringFacetValue(facets.archimateLayer ?? (el as unknown as { layer?: unknown }).layer ?? el.layer ?? '');
  const doc = docSnippet(el.documentation);

  const lines: string[] = [];
  if (typeLabel) lines.push(`Type: ${typeLabel}`);
  if (layer) lines.push(`Layer: ${layer}`);
  if (doc) lines.push(`Documentation: ${doc}`);

  const title = adapter.getNodeLabel(el, model) || String(el.name ?? '').trim() || '(unnamed)';
  return { title, lines };
}

export function buildRelationshipTooltipFromTraversalStep(
  adapter: AnalysisAdapter,
  model: Model,
  step: TraversalStep,
  labelForId: (elementId: string) => string
): AnalysisTooltip | null {
  const r = step.relationship;
  const analysisEdge = edgeFromStep(step);

  const from = labelForId(step.fromId);
  const to = labelForId(step.toId);

  const typeLabel = (() => {
    if (r) {
      if (r.type !== 'Unknown') return getRelationshipTypeLabel(r.type);
      const unk = r.unknownType?.name ? String(r.unknownType.name) : '';
      return unk ? `Unknown: ${unk}` : 'Unknown';
    }
    // Fallback to step relationshipType when relationship object is missing.
    const t = String(step.relationshipType ?? '');
    if (!t) return 'Relationship';
    return t !== 'Unknown' ? getRelationshipTypeLabel(t) : 'Unknown';
  })();

  const title = (() => {
    const label = adapter.getEdgeLabel(analysisEdge, model);
    const name = r?.name ? String(r.name).trim() : '';
    return name ? `${typeLabel} — ${name}` : (label || typeLabel || '(relationship)');
  })();

  const lines: string[] = [];
  if (typeLabel) lines.push(`Type: ${typeLabel}`);
  if (from) lines.push(`From: ${from}`);
  if (to) lines.push(`To: ${to}`);
  const doc = docSnippet(r?.documentation);
  if (doc) lines.push(`Documentation: ${doc}`);

  return { title, lines };
}

export function buildRelationshipTooltipFromRelationshipId(
  model: Model,
  args: {
    relationshipId?: string | null;
    relationshipType?: string | null;
    fromId: string;
    toId: string;
    labelForId: (elementId: string) => string;
  }
): AnalysisTooltip | null {
  const { relationshipId, relationshipType, fromId, toId, labelForId } = args;
  const rel = relationshipId ? model.relationships[relationshipId] : undefined;

  const typeLabel = (() => {
    const raw = rel?.type ? String(rel.type) : String(relationshipType ?? '');
    if (rel && raw === 'Unknown') {
      const unk = rel.unknownType?.name ? String(rel.unknownType.name) : '';
      return unk ? `Unknown: ${unk}` : 'Unknown';
    }
    if (!raw) return 'Relationship';
    return raw !== 'Unknown' ? getRelationshipTypeLabel(raw) : 'Unknown';
  })();

  const name = rel?.name ? String(rel.name).trim() : '';
  const title = name ? `${typeLabel} — ${name}` : typeLabel;

  const lines: string[] = [];
  if (typeLabel) lines.push(`Type: ${typeLabel}`);
  lines.push(`From: ${labelForId(fromId)}`);
  lines.push(`To: ${labelForId(toId)}`);

  const doc = docSnippet(rel?.documentation);
  if (doc) lines.push(`Documentation: ${doc}`);

  return { title, lines };
}