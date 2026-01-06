import type { ExternalIdRef } from '../types';
import {
  dedupeExternalIds,
  ensureExternalId,
  externalKey,
  normalizeExternalIdRef,
  tidyExternalIds,
  upsertExternalId
} from '../externalIds';

describe('domain externalIds helpers', () => {
  test('normalizeExternalIdRef trims and drops invalid entries', () => {
    expect(normalizeExternalIdRef(undefined)).toBeUndefined();
    expect(normalizeExternalIdRef({ system: '  ', id: 'x' })).toBeUndefined();
    expect(normalizeExternalIdRef({ system: 'a', id: '   ' })).toBeUndefined();

    expect(normalizeExternalIdRef({ system: '  archimate-exchange  ', id: '  id-1  ' })).toEqual({
      system: 'archimate-exchange',
      id: 'id-1'
    });

    expect(
      normalizeExternalIdRef({ system: 'ea-xmi', id: 'EAID_123', scope: '  model1  ' })
    ).toEqual({ system: 'ea-xmi', id: 'EAID_123', scope: 'model1' });
  });

  test('externalKey uses system|scope|id (scope empty when undefined)', () => {
    expect(externalKey({ system: 'a', id: 'b', scope: undefined })).toBe('a||b');
    expect(externalKey({ system: 'a', id: 'b', scope: 's' })).toBe('a|s|b');
  });

  test('dedupeExternalIds keeps last occurrence and preserves order of last occurrences', () => {
    const list: ExternalIdRef[] = [
      { system: 'x', id: '1' },
      { system: 'x', id: '2' },
      { system: 'x', id: '1', scope: 'a' },
      { system: 'x', id: '1' }, // duplicates first (same key)
      { system: 'x', id: '1', scope: 'a' } // duplicates third (same key)
    ];

    const d = dedupeExternalIds(list);
    expect(d).toEqual([
      { system: 'x', id: '2' },
      { system: 'x', id: '1' },
      { system: 'x', id: '1', scope: 'a' }
    ]);
  });

  test('upsertExternalId replaces in place when key exists', () => {
    const list: ExternalIdRef[] = [
      { system: 'archimate-exchange', id: 'id-1' },
      { system: 'ea-xmi', id: 'EAID_1' }
    ];

    const next = upsertExternalId(list, { system: 'ea-xmi', id: 'EAID_1', scope: 'm1' });
    // Different key due to scope, so it should append.
    expect(next).toEqual([
      { system: 'archimate-exchange', id: 'id-1' },
      { system: 'ea-xmi', id: 'EAID_1' },
      { system: 'ea-xmi', id: 'EAID_1', scope: 'm1' }
    ]);

    const next2 = upsertExternalId(next, { system: 'archimate-exchange', id: 'id-1', scope: '  ' });
    // Same key as first (scope undefined), so replace in place (no order change)
    expect(next2).toEqual([
      { system: 'archimate-exchange', id: 'id-1' },
      { system: 'ea-xmi', id: 'EAID_1' },
      { system: 'ea-xmi', id: 'EAID_1', scope: 'm1' }
    ]);
  });

  test('tidyExternalIds returns undefined for empty/invalid lists', () => {
    expect(tidyExternalIds(undefined)).toBeUndefined();
    expect(tidyExternalIds([])).toBeUndefined();
    expect(tidyExternalIds([{ system: ' ', id: 'x' } as ExternalIdRef])).toBeUndefined();
  });

  test('ensureExternalId returns existing when present and creates when missing', () => {
    const list: ExternalIdRef[] = [{ system: 'archimate-exchange', id: 'id-1' }];

    const existing = ensureExternalId(list, 'archimate-exchange');
    expect(existing.ref).toEqual({ system: 'archimate-exchange', id: 'id-1' });
    expect(existing.externalIds).toEqual([{ system: 'archimate-exchange', id: 'id-1' }]);

    const created = ensureExternalId(list, 'ea-xmi', 'model1', () => 'GEN');
    expect(created.ref).toEqual({ system: 'ea-xmi', id: 'GEN', scope: 'model1' });
    expect(created.externalIds).toEqual([
      { system: 'archimate-exchange', id: 'id-1' },
      { system: 'ea-xmi', id: 'GEN', scope: 'model1' }
    ]);
  });
});
