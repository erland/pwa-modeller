import type { TaggedValue, TaggedValueType } from '../types';
import { createId } from '../id';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const ALLOWED_TAGGED_VALUE_TYPES: TaggedValueType[] = ['string', 'number', 'boolean', 'json'];

/**
 * Best-effort sanitization for persisted tagged values.
 *
 * - Coerces IDs (generates missing)
 * - Trims namespace/key
 * - Coerces value to string
 * - Validates/canonicalizes declared type when possible
 * - De-dups by (ns,key), keeping the last occurrence
 */
export function sanitizeTaggedValuesList(raw: unknown): TaggedValue[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  // First pass: coerce/validate entries
  const coerced: TaggedValue[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as unknown;
    if (!isRecord(item)) continue;

    const idRaw = item.id;
    const id = typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw.trim() : createId('tag');

    const nsRaw = item.ns;
    const ns = typeof nsRaw === 'string' ? nsRaw.trim() : '';
    const nsNorm = ns.length > 0 ? ns : undefined;

    const keyRaw = item.key;
    const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
    if (!key) continue;

    const typeRaw = item.type;
    const type =
      typeof typeRaw === 'string' && (ALLOWED_TAGGED_VALUE_TYPES as readonly string[]).includes(typeRaw)
        ? (typeRaw as TaggedValueType)
        : undefined;

    let value: string;
    const valueRaw = (item as any).value;
    if (typeof valueRaw === 'string') value = valueRaw;
    else if (typeof valueRaw === 'number' || typeof valueRaw === 'boolean') value = String(valueRaw);
    else if (valueRaw === null || valueRaw === undefined) value = '';
    else {
      // Best-effort for legacy/bad data: stringify objects, fall back to String().
      try {
        value = JSON.stringify(valueRaw);
      } catch {
        value = String(valueRaw);
      }
    }

    // Optional canonicalization based on declared type
    if (type === 'boolean') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === 'false') value = v;
    } else if (type === 'json') {
      const v = value.trim();
      if (v.length > 0) {
        try {
          const parsed = JSON.parse(v);
          value = JSON.stringify(parsed);
        } catch {
          // keep as-is
        }
      }
    } else if (type === 'number') {
      const v = value.trim();
      if (v.length > 0) {
        const n = Number(v);
        if (Number.isFinite(n)) value = v;
      }
    }

    coerced.push({ id, ns: nsNorm, key, type, value });
  }

  if (coerced.length === 0) return undefined;

  // Second pass: de-dup by (ns, key), keeping the LAST occurrence (stable order of last occurrences).
  const lastIndex = new Map<string, number>();
  for (let i = 0; i < coerced.length; i++) {
    const t = coerced[i];
    const ident = `${t.ns ?? ''}::${t.key}`;
    lastIndex.set(ident, i);
  }

  const deduped: TaggedValue[] = [];
  for (let i = 0; i < coerced.length; i++) {
    const t = coerced[i];
    const ident = `${t.ns ?? ''}::${t.key}`;
    if (lastIndex.get(ident) === i) deduped.push(t);
  }

  return deduped.length > 0 ? deduped : undefined;
}
