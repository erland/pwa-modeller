import type { Element, Model, TaggedValue } from '../../types';

export type TaggedValuesProvider = (el: Element) => TaggedValue[] | undefined;

export type NumericPropertyOptions = {
  /**
   * Optional tagged-values provider.
   *
   * This is useful when consumers want to read *effective* tagged values
   * (e.g. overlay tags overriding core tags).
   */
  getTaggedValues?: TaggedValuesProvider;
};

/**
 * Parse a property key.
 *
 * - "ns:key" targets a tagged value with the given namespace+key.
 * - "key" targets any tagged value with that key (any namespace), or falls back to attrs lookup.
 */
export function parsePropertyKey(input: string): { ns?: string; key: string } {
  const raw = (input ?? '').trim();
  if (!raw) return { key: '' };

  const idx = raw.indexOf(':');
  if (idx > 0) {
    const ns = raw.slice(0, idx).trim();
    const key = raw.slice(idx + 1).trim();
    return { ns: ns || undefined, key };
  }
  return { key: raw };
}

function asFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function getTaggedValueNumber(tag: TaggedValue): number | undefined {
  // If tag type is explicit number, parse its value. Otherwise allow numeric strings too.
  return asFiniteNumber(tag.value);
}

/**
 * Try to read a numeric property from an element.
 *
 * Order:
 * 1) Tagged values (supports "ns:key" or just "key")
 * 2) attrs lookup (only for plain "key", supports dotted paths like "a.b.c")
 */
export function readNumericPropertyFromElement(
  el: Element | undefined,
  propertyKey: string,
  opts?: NumericPropertyOptions
): number | undefined {
  if (!el) return undefined;

  const { ns, key } = parsePropertyKey(propertyKey);
  if (!key) return undefined;

  const tags = opts?.getTaggedValues?.(el) ?? el.taggedValues ?? [];
  if (tags.length) {
    if (ns) {
      const match = tags.find((t) => (t.ns ?? '').trim() === ns && (t.key ?? '').trim() === key);
      const n = match ? getTaggedValueNumber(match) : undefined;
      if (n !== undefined) return n;
    } else {
      const match = tags.find((t) => (t.key ?? '').trim() === key);
      const n = match ? getTaggedValueNumber(match) : undefined;
      if (n !== undefined) return n;
    }
  }

  // attrs fallback (only for non-namespaced keys)
  if (!ns && el.attrs && typeof el.attrs === 'object') {
    const parts = key.split('.').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return undefined;

    let cur: unknown = el.attrs as unknown;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return asFiniteNumber(cur);
  }

  return undefined;
}

/**
 * Discover likely numeric property keys for nodes.
 *
 * This looks at:
 * - element.taggedValues of type number (or numeric values)
 * - element.attrs top-level numeric-ish fields (best-effort)
 *
 * Returned values may include both "key" and "ns:key" forms.
 */
export function discoverNumericPropertyKeys(model: Model, opts?: NumericPropertyOptions): string[] {
  const out = new Set<string>();

  const pushKey = (k: string | undefined) => {
    const t = (k ?? '').trim();
    if (t) out.add(t);
  };

  for (const el of Object.values(model.elements ?? {})) {
    // tagged values
    const tags = opts?.getTaggedValues?.(el) ?? el.taggedValues ?? [];
    for (const tv of tags) {
      const key = (tv.key ?? '').trim();
      if (!key) continue;
      const n = getTaggedValueNumber(tv);
      if (n === undefined) continue;

      pushKey(key);
      const ns = (tv.ns ?? '').trim();
      if (ns) pushKey(`${ns}:${key}`);
    }

    // attrs: top-level numeric fields
    if (el.attrs && typeof el.attrs === 'object' && !Array.isArray(el.attrs)) {
      const rec = el.attrs as Record<string, unknown>;
      for (const [k, v] of Object.entries(rec)) {
        const n = asFiniteNumber(v);
        if (n === undefined) continue;
        pushKey(k);
      }
    }
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b));
}
