import type { Model } from '../../../../domain';

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
  return Array.from(new Set(values.filter((x) => typeof x === 'string' && x.length > 0))).sort((a, b) => a.localeCompare(b));
}

export function collectAllRelationshipTypes(model: Model): string[] {
  const set = new Set<string>();
  for (const r of Object.values(model.relationships)) {
    if (!r.type) continue;
    set.add(r.type);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export type XY = { x: number; y: number };

export function dist2(a: XY, b: XY): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
