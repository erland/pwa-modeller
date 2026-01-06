import type { ExternalIdRef } from './types';

export type ExternalIdKey = string;

export function normalizeExternalIdRef(ref: unknown): ExternalIdRef | undefined {
  if (!ref || typeof ref !== 'object') return undefined;
  const r = ref as Partial<ExternalIdRef>;

  const system = (r.system ?? '').toString().trim();
  const id = (r.id ?? '').toString().trim();
  const scopeRaw = r.scope === undefined ? undefined : (r.scope ?? '').toString().trim();
  const scope = scopeRaw ? scopeRaw : undefined;

  if (!system || !id) return undefined;
  return { system, id, scope };
}

/**
 * Stable key for matching external ids.
 *
 * Format: `system|scope|id` where scope is empty string when not present.
 */
export function externalKey(ref: Pick<ExternalIdRef, 'system' | 'id' | 'scope'>): ExternalIdKey {
  const system = (ref.system ?? '').toString().trim();
  const id = (ref.id ?? '').toString().trim();
  const scope = (ref.scope ?? '').toString().trim();
  return `${system}|${scope}|${id}`;
}

/**
 * Normalize and dedupe a list of external ids.
 *
 * - Drops invalid entries.
 * - Dedupe by externalKey.
 * - Keeps the *last* occurrence of a duplicated key.
 * - Preserves order of last occurrences.
 */
export function dedupeExternalIds(list: ExternalIdRef[] | undefined): ExternalIdRef[] {
  const normalized: ExternalIdRef[] = (list ?? [])
    .map((x) => normalizeExternalIdRef(x))
    .filter((x): x is ExternalIdRef => !!x);

  const seen = new Set<string>();
  const out: ExternalIdRef[] = [];

  // Walk backwards so we keep the last occurrence.
  for (let i = normalized.length - 1; i >= 0; i--) {
    const ref = normalized[i];
    const k = externalKey(ref);
    if (seen.has(k)) continue;
    seen.add(k);
    out.unshift(ref);
  }

  return out;
}

/**
 * Upsert an external id reference by key.
 *
 * - If an entry with the same key exists, it is replaced in-place (order preserved).
 * - Otherwise, the entry is appended.
 * - Result is normalized and deduped.
 */
export function upsertExternalId(
  list: ExternalIdRef[] | undefined,
  ref: ExternalIdRef
): ExternalIdRef[] {
  const norm = normalizeExternalIdRef(ref);
  if (!norm) return dedupeExternalIds(list);

  const next = [...(list ?? [])];
  const k = externalKey(norm);
  const idx = next.findIndex((x) => {
    const nx = normalizeExternalIdRef(x);
    return nx ? externalKey(nx) === k : false;
  });

  if (idx >= 0) next[idx] = norm;
  else next.push(norm);

  return dedupeExternalIds(next);
}

/** Convenience helper to keep storage tidy (undefined instead of empty array). */
export function tidyExternalIds(list: ExternalIdRef[] | undefined): ExternalIdRef[] | undefined {
  const d = dedupeExternalIds(list);
  return d.length ? d : undefined;
}
