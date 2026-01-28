export function formatMetricValue(v: number): string {
  if (!Number.isFinite(v)) return '';
  // Keep stable, compact formatting.
  const isInt = Math.abs(v - Math.round(v)) < 1e-9;
  return isInt ? String(Math.round(v)) : v.toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1');
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function toTestIdKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export function percentRounded(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
