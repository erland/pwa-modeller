import type { Element, Model } from '../../types';
import type { AnalysisAdapter, AnalysisFacetValue } from '../../../analysis/adapters/AnalysisAdapter';

export type PortfolioPopulationFilter = {
  layers?: string[];
  types?: string[];
  search?: string;
};

export type PortfolioRowBase = {
  elementId: string;
  label: string;
  typeLabel: string;
  layerLabel?: string;
  typeKey: string;
  layerKey?: string;
};

function normalizeFacetValue(v: AnalysisFacetValue): string[] {
  if (!v) return [];
  if (typeof v === 'string') return v ? [v] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
  return [];
}

function matchesMultiFilter(value: AnalysisFacetValue, wanted: readonly string[] | undefined): boolean {
  if (!wanted || wanted.length === 0) return true;
  const got = normalizeFacetValue(value);
  if (got.length === 0) return false;
  const wantedSet = new Set(wanted);
  return got.some((x) => wantedSet.has(x));
}

function matchesSearch(label: string, search: string | undefined): boolean {
  const q = (search ?? '').trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

function safeString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function resolveElement(node: Element, model: Model): Element {
  return model.elements?.[node.id] ?? node;
}

/**
 * Produce the base population rows for the Portfolio table.
 *
 * Notes:
 * - ArchiMate layers are typically a single string, but adapters may return arrays; we treat arrays as "multi".
 * - `layerKey` / `typeKey` are intended as stable raw ids for filtering.
 */
export function buildPortfolioPopulation(params: {
  model: Model;
  adapter: AnalysisAdapter;
  filter?: PortfolioPopulationFilter;
}): PortfolioRowBase[] {
  const { model, adapter, filter } = params;
  const layers = filter?.layers;
  const types = filter?.types;
  const search = filter?.search;

  const out: PortfolioRowBase[] = [];

  for (const el0 of Object.values(model.elements ?? {})) {
    if (!el0?.id) continue;
    const el = resolveElement(el0, model);

    const label = adapter.getNodeLabel(el, model) || '(unnamed)';
    if (!matchesSearch(label, search)) continue;

    const facets = adapter.getNodeFacetValues(el, model);
    const typeFacet = facets.elementType ?? el.type;
    const layerFacet = facets.archimateLayer ?? el.layer;

    if (!matchesMultiFilter(typeFacet, types)) continue;
    if (!matchesMultiFilter(layerFacet, layers)) continue;

    const typeLabel = safeString(facets.type ?? typeFacet ?? el.type) || 'Unknown';
    const typeKey = safeString(typeFacet ?? el.type) || 'Unknown';

    const layerValues = normalizeFacetValue(layerFacet);
    const layerLabel = layerValues.length ? layerValues.join(', ') : '';
    const layerKey = layerValues.length ? layerValues[0] : undefined;

    out.push({
      elementId: el.id,
      label,
      typeLabel,
      layerLabel: layerLabel || undefined,
      typeKey,
      layerKey
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return out;
}
