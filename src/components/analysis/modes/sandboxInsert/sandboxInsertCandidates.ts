import type { Candidate, PreviewState } from './types';

import { normalizeText } from './utils';

export function candidateMatchesSearch(args: { c: Candidate; q: string }): boolean {
  const q = normalizeText(args.q);
  if (!q) return true;
  const c = args.c;
  const hay = `${c.name} ${c.type} ${c.id}`.toLowerCase();
  return hay.includes(q);
}

export function buildCandidateById(preview: PreviewState | null): Map<string, Candidate> {
  const m = new Map<string, Candidate>();
  for (const c of preview?.candidates ?? []) m.set(c.id, c);
  return m;
}

export function computeVisibleCandidateIds(preview: PreviewState | null, search: string): Set<string> {
  if (!preview) return new Set<string>();
  const ids = new Set<string>();
  for (const c of preview.candidates) {
    if (!candidateMatchesSearch({ c, q: search })) continue;
    ids.add(c.id);
  }
  return ids;
}

export function countSelectedNew(args: { candidateById: Map<string, Candidate>; selectedIds: Set<string> }): number {
  let n = 0;
  for (const id of args.selectedIds) {
    const c = args.candidateById.get(id);
    if (c && !c.alreadyInSandbox) n++;
  }
  return n;
}

export function countSelectedVisible(args: { selectedIds: Set<string>; visibleCandidateIds: Set<string> }): number {
  let n = 0;
  for (const id of args.selectedIds) {
    if (args.visibleCandidateIds.has(id)) n++;
  }
  return n;
}
