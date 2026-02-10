type TaggedValueLike = { ns?: unknown; key?: unknown; type?: unknown; value?: unknown };

export function readTaggedValue(tv: unknown): { label: string; type?: string; value: string } | null {
  if (!tv || typeof tv !== 'object') return null;
  const t = tv as TaggedValueLike;
  const ns = typeof t.ns === 'string' ? t.ns.trim() : '';
  const key = typeof t.key === 'string' ? t.key.trim() : '';
  const type = typeof t.type === 'string' ? t.type.trim() : '';
  const value = String(t.value ?? '');
  const label = ns ? `${ns}:${key}` : key;
  if (!label) return null;
  return { label, type: type || undefined, value };
}
