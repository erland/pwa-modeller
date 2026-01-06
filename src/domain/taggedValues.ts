import type { TaggedValue, TaggedValueType } from './types';

/**
 * Normalize a tag namespace.
 *
 * - Trims whitespace.
 * - Returns empty string when undefined.
 */
export function normalizeNs(ns?: string): string {
  return (ns ?? '').trim();
}

/**
 * Normalize a tag key.
 *
 * - Trims whitespace.
 */
export function normalizeKey(key: string): string {
  return key.trim();
}

function normalizeType(type?: TaggedValueType): TaggedValueType | undefined {
  // Defensive: keep only supported values.
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'json') return type;
  return undefined;
}

/**
 * Returns a new array with the tagged value inserted or updated.
 *
 * Identity is (namespace, key). If an existing entry matches, it is replaced,
 * but the existing entry's id is preserved to keep UI identity stable.
 *
 * If the key normalizes to empty, the list is returned unchanged.
 */
export function upsertTaggedValue(
  list: TaggedValue[] | undefined,
  entry: TaggedValue
): TaggedValue[] {
  const ns = normalizeNs(entry.ns);
  const key = normalizeKey(entry.key);

  if (!key) return list ? [...list] : [];

  const next = [...(list ?? [])];
  const idx = next.findIndex((t) => normalizeNs(t.ns) === ns && normalizeKey(t.key) === key);

  const normalized: TaggedValue = {
    ...entry,
    ns: ns || undefined,
    key,
    type: normalizeType(entry.type)
  };

  if (idx >= 0) {
    // Preserve id for stable UI operations when overwriting by (ns,key).
    normalized.id = next[idx].id;
    next[idx] = normalized;
  } else {
    next.push(normalized);
  }

  return next;
}

/**
 * Returns a new array with the tagged value removed (by id).
 */
export function removeTaggedValue(list: TaggedValue[] | undefined, id: string): TaggedValue[] {
  return (list ?? []).filter((t) => t.id !== id);
}

export interface TaggedValueValidation {
  /** Normalized (trimmed) ns/key and validated type. */
  normalized: TaggedValue;
  /** Hard errors that should block save/export (caller decides). */
  errors: string[];
  /** Non-fatal warnings to show in UI. */
  warnings: string[];
}

/**
 * Validate and normalize a tagged value.
 *
 * This is intentionally lightweight and UI-friendly.
 * - Always returns a normalized entry.
 * - Provides errors/warnings without throwing.
 */
export function validateTaggedValue(entry: TaggedValue): TaggedValueValidation {
  const ns = normalizeNs(entry.ns);
  const key = normalizeKey(entry.key);
  const type = normalizeType(entry.type);

  const normalized: TaggedValue = {
    ...entry,
    ns: ns || undefined,
    key,
    type
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!key) {
    errors.push('Key is required.');
    return { normalized, errors, warnings };
  }

  const raw = (normalized.value ?? '').toString();
  normalized.value = raw;

  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) errors.push('Value must be a finite number.');
  } else if (type === 'boolean') {
    const v = raw.trim().toLowerCase();
    if (v !== 'true' && v !== 'false') errors.push('Value must be true or false.');
    // Canonicalize if valid.
    if (errors.length === 0) normalized.value = v;
  } else if (type === 'json') {
    try {
      const parsed = JSON.parse(raw);
      // Canonicalize to a stable string (no whitespace). UI can pretty-print later.
      normalized.value = JSON.stringify(parsed);
    } catch {
      errors.push('Value must be valid JSON.');
    }
  } else {
    // string or undefined: no structural validation
    if (raw.length > 50_000) warnings.push('Value is very large.');
  }

  return { normalized, errors, warnings };
}
