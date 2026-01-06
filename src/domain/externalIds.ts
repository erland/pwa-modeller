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

/** Normalize a scope string (trim and convert empty to undefined). */
function normalizeScope(scope?: string): string | undefined {
  const s = (scope ?? '').toString().trim();
  return s ? s : undefined;
}

/** Find the first external id matching system+scope (scope compared after normalization). */
export function findExternalId(
  list: ExternalIdRef[] | undefined,
  system: string,
  scope?: string
): ExternalIdRef | undefined {
  const sys = (system ?? '').toString().trim();
  if (!sys) return undefined;
  const sc = normalizeScope(scope);

  const normalized = dedupeExternalIds(list);
  return normalized.find((r) => r.system === sys && normalizeScope(r.scope) === sc);
}

/** Default generator for new external IDs (browser + tests). */
export function defaultGenerateExternalId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback: not cryptographically strong, but good enough for local identifiers.
  return `ext_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/**
 * Ensure there is an external id for a given system+scope.
 *
 * - If it exists, it is returned unchanged.
 * - Otherwise, a new id is generated, upserted, and returned.
 */
export function ensureExternalId(
  list: ExternalIdRef[] | undefined,
  system: string,
  scope?: string,
  generateId: () => string = defaultGenerateExternalId
): { externalIds: ExternalIdRef[] | undefined; ref: ExternalIdRef } {
  const sys = (system ?? '').toString().trim();
  const sc = normalizeScope(scope);
  if (!sys) {
    // This should be a programmer error; we still behave predictably.
    const ref: ExternalIdRef = { system: 'unknown-system', id: generateId(), scope: sc };
    return { externalIds: tidyExternalIds(upsertExternalId(list, ref)), ref };
  }

  const existing = findExternalId(list, sys, sc);
  if (existing) return { externalIds: tidyExternalIds(list), ref: existing };

  const ref: ExternalIdRef = { system: sys, id: generateId(), scope: sc };
  const next = tidyExternalIds(upsertExternalId(list, ref));
  return { externalIds: next, ref };
}
