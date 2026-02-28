/**
 * Deterministic JSON stringification.
 *
 * We use this for operation IDs and tests; it sorts object keys recursively.
 *
 * Limitations:
 * - Intended for plain JSON-compatible data.
 * - Does not support cycles.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (v === null) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'undefined') return null;
    if (typeof v === 'function' || typeof v === 'symbol') return null;

    const t = typeof v;

    if (Array.isArray(v)) return v.map(walk);

    if (t === 'object') {
      const obj = v as Record<string, unknown>;
      if (seen.has(obj)) throw new Error('stableStringify: cycles are not supported');
      seen.add(obj);
      const keys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = walk(obj[k]);
      seen.delete(obj);
      return out;
    }

    return null;
  };

  return JSON.stringify(walk(value));
}
