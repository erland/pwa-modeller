import type { TraversalStep } from '../../../domain';
import type { AnalysisEdge } from '../../../domain/analysis/graph';
import { isExplicitlyUndirected } from '../../../domain/analysis/directedness';

export function docSnippet(doc: string | undefined): string {
  const t = (doc ?? '').trim();
  if (!t) return '';
  if (t.length <= 240) return t;
  return `${t.slice(0, 239)}…`;
}

export function stringFacetValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(String).join(', ');
  return String(v);
}

export function escapeCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function relationshipIsExplicitlyUndirected(s: TraversalStep): boolean {
  return isExplicitlyUndirected(s.relationship?.attrs);
}

export function edgeFromStep(s: TraversalStep): AnalysisEdge {
  return {
    relationshipId: s.relationshipId,
    relationshipType: s.relationshipType,
    relationship: s.relationship,
    fromId: s.fromId,
    toId: s.toId,
    reversed: s.reversed,
    undirected: relationshipIsExplicitlyUndirected(s)
  };
}
