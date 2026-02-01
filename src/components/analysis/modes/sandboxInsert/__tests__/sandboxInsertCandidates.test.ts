import type { Candidate, PreviewState } from '../types';

import {
  buildCandidateById,
  candidateMatchesSearch,
  computeVisibleCandidateIds,
  countSelectedNew,
  countSelectedVisible,
} from '../sandboxInsertCandidates';

function makeCandidate(id: string, name: string, type: string, alreadyInSandbox = false): Candidate {
  return { id, name, type, alreadyInSandbox };
}

function makePreview(candidates: Candidate[]): PreviewState {
  return {
    kind: 'intermediates',
    paths: [],
    candidates,
    defaultSelectedIds: new Set<string>(),
  };
}

describe('sandboxInsertCandidates', () => {
  const candidates: Candidate[] = [
    makeCandidate('A', 'Alpha', 'uml.class'),
    makeCandidate('T1', 'Thing', 'ArchimateComponent'),
    makeCandidate('C', 'Charlie', 'uml.class', true),
  ];

  test('candidateMatchesSearch matches by id/name/type (case-insensitive)', () => {
    expect(candidateMatchesSearch({ c: candidates[0], q: 'a' })).toBe(true); // id + name
    expect(candidateMatchesSearch({ c: candidates[0], q: 'ALP' })).toBe(true); // name
    expect(candidateMatchesSearch({ c: candidates[1], q: 't1' })).toBe(true); // id
    expect(candidateMatchesSearch({ c: candidates[1], q: 'archi' })).toBe(true); // type
    expect(candidateMatchesSearch({ c: candidates[0], q: 'zzz' })).toBe(false);
  });

  test('buildCandidateById creates stable lookup from preview', () => {
    const byId = buildCandidateById(makePreview(candidates));
    expect(byId.get('A')?.name).toBe('Alpha');
    expect(byId.get('NOPE')).toBeUndefined();
  });

  test('computeVisibleCandidateIds filters by search', () => {
    const preview = makePreview(candidates);
    expect(Array.from(computeVisibleCandidateIds(preview, '')).sort()).toEqual(['A', 'C', 'T1'].sort());
    expect(Array.from(computeVisibleCandidateIds(preview, 'uml')).sort()).toEqual(['A', 'C'].sort());
    expect(Array.from(computeVisibleCandidateIds(preview, 'zzz'))).toEqual([]);
  });

  test('countSelectedNew and countSelectedVisible compute counts based on selection + visibility', () => {
    const preview = makePreview(candidates);
    const candidateById = buildCandidateById(preview);

    const selectedIds = new Set<string>(['A', 'C', 'NOPE']);
    const visibleCandidateIds = new Set<string>(['A', 'T1']);

    expect(countSelectedNew({ candidateById, selectedIds })).toBe(1); // A is new, C is already in sandbox
    expect(countSelectedVisible({ selectedIds, visibleCandidateIds })).toBe(1); // only A is both selected and visible
  });
});
