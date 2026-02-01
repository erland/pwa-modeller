export function normalizeText(v: string): string {
  return (v || '').trim().toLowerCase();
}

export function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const iv = Math.round(v);
  if (iv < min) return min;
  if (iv > max) return max;
  return iv;
}

export function toggleString(values: string[], v: string): string[] {
  const set = new Set(values);
  if (set.has(v)) set.delete(v);
  else set.add(v);
  return Array.from(set);
}

export function uniqSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values))
    .filter((v) => typeof v === 'string' && v.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
