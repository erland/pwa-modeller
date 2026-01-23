import type {
  AnalysisDirection,
  Element,
  ElementType,
  Model,
  ModelKind,
  RelationshipType
} from '../../../domain';
import { getElementTypeLabel } from '../../../domain';
import { getAnalysisAdapter } from '../../../analysis/adapters/registry';

import type { AnalysisMode } from '../AnalysisQueryPanel';

// We keep filter option lists dynamic (derived from the loaded model) so that
// users working with a tailored meta-model don't see irrelevant options.

export function getAvailableRelationshipTypes(model: Model): RelationshipType[] {
  const seen = new Set<RelationshipType>();
  for (const rel of Object.values(model.relationships)) {
    if (!rel?.type) continue;
    seen.add(rel.type);
  }
  return Array.from(seen).sort((a, b) => String(a).localeCompare(String(b)));
}

export function collectFacetValues<T extends string>(model: Model, modelKind: ModelKind, facetId: string): T[] {
  const adapter = getAnalysisAdapter(modelKind);
  const seen = new Set<string>();
  for (const el of Object.values(model.elements)) {
    if (!el) continue;
    const v = adapter.getNodeFacetValues(el, model)[facetId];
    if (typeof v === 'string') {
      if (v) seen.add(v);
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item) seen.add(item);
      }
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b)) as T[];
}

export function collectFacetValuesConstrained<T extends string>(
  model: Model,
  modelKind: ModelKind,
  valueFacetId: string,
  constraintFacetId: string,
  allowedConstraints: readonly string[]
): T[] {
  if (!allowedConstraints.length) return [] as T[];
  const adapter = getAnalysisAdapter(modelKind);
  const allowed = new Set<string>(allowedConstraints);
  const seen = new Set<string>();

  for (const el of Object.values(model.elements)) {
    if (!el) continue;
    const facets = adapter.getNodeFacetValues(el, model);
    const constraintV = facets[constraintFacetId];
    let constraintMatch = false;
    if (typeof constraintV === 'string') {
      constraintMatch = allowed.has(constraintV);
    } else if (Array.isArray(constraintV)) {
      constraintMatch = constraintV.some((x) => typeof x === 'string' && allowed.has(x));
    }
    if (!constraintMatch) continue;

    const v = facets[valueFacetId];
    if (typeof v === 'string') {
      if (v) seen.add(v);
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item) seen.add(item);
      }
    }
  }

  return Array.from(seen).sort((a, b) => a.localeCompare(b)) as T[];
}

export function toggle<T extends string>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function dedupeSort(arr: readonly string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

export function pruneToAllowed<T extends string>(selected: readonly T[], allowed: readonly T[]): T[] {
  const s = new Set<T>(allowed);
  const pruned = selected.filter((x) => s.has(x));
  return pruned.length === selected.length ? (selected as T[]) : pruned;
}

export function sortElementTypesForDisplay(types: readonly ElementType[]): ElementType[] {
  const out = [...types] as ElementType[];
  out.sort((a, b) =>
    getElementTypeLabel(a).localeCompare(getElementTypeLabel(b), undefined, { sensitivity: 'base' })
  );
  return out;
}

export function labelForElement(e: Element): string {
  const type = e.type ? String(e.type) : 'Unknown';
  const layer = e.layer ? String(e.layer) : '';
  const suffix = layer ? ` (${type}, ${layer})` : ` (${type})`;
  return `${e.name || '(unnamed)'}${suffix}`;
}

export function hasAnyFilters(params: {
  mode: AnalysisMode;
  relationshipTypesSorted: readonly RelationshipType[];
  layersSorted: readonly string[];
  elementTypesSorted: readonly ElementType[];
  direction: AnalysisDirection;
  maxDepth: number;
  includeStart: boolean;
  maxPaths: number;
  maxPathLength: number | null;
}): boolean {
  const {
    mode,
    relationshipTypesSorted,
    layersSorted,
    elementTypesSorted,
    direction,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength
  } = params;

  return (
    relationshipTypesSorted.length > 0 ||
    layersSorted.length > 0 ||
    (mode !== 'paths' && elementTypesSorted.length > 0) ||
    direction !== 'both' ||
    (mode !== 'paths'
      ? maxDepth !== 4 || (mode === 'related' && includeStart)
      : maxPaths !== 10 || maxPathLength !== null)
  );
}
