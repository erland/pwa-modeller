/**
 * Domain-level ID creation.
 *
 * - Uses `crypto.randomUUID()` when available.
 * - Falls back to a reasonably unique string for older environments.
 */

let fallbackCounter = 0;

export function createId(prefix?: string): string {
  const p = prefix ? `${prefix}_` : '';

  // Browser + modern Node.
  const maybeCrypto = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
  if (maybeCrypto?.randomUUID) {
    return `${p}${maybeCrypto.randomUUID()}`;
  }

  // Best-effort fallback.
  // This is not cryptographically secure, but is good enough for local, offline models.
  fallbackCounter = (fallbackCounter + 1) % 1_000_000;
  const now = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  const cnt = fallbackCounter.toString(36);
  return `${p}${now}_${rand}_${cnt}`;
}
