/**
 * Step 9 hardening: portal-side fetch + dataset size limits.
 *
 * The portal should never crash (or freeze) because a host serves huge or malformed JSON.
 * These defaults are intentionally conservative; tune them if your bundles grow.
 */

export const PORTAL_FETCH_TIMEOUT_MS = 20_000;

export const PORTAL_MAX_BYTES = {
  latestJson: 256 * 1024, // 256 KB
  manifestJson: 512 * 1024, // 512 KB
  modelJson: 30 * 1024 * 1024, // 30 MB
  indexesJson: 15 * 1024 * 1024 // 15 MB
} as const;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const kb = 1024;
  const mb = kb * 1024;
  if (n < kb) return `${n} B`;
  if (n < mb) return `${Math.round(n / kb)} KB`;
  return `${(n / mb).toFixed(1)} MB`;
}
