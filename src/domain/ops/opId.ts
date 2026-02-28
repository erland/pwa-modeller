import { crc32 } from '../../export/zip/crc32';
import { stableStringify } from './stableStringify';

function bytesOfUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function hex8(n: number): string {
  // crc32 returns a signed 32-bit int in JS; normalize to unsigned.
  return ((n >>> 0).toString(16).padStart(8, '0'));
}

/**
 * Build a deterministic operation id based on the op content.
 *
 * - Deterministic IDs are convenient in unit tests and make retries idempotent.
 * - Callers can optionally include a caller-provided namespace/seed.
 */
export function buildDeterministicOpId(seed: string, content: unknown): string {
  const s = `${seed}:${stableStringify(content)}`;
  return `op_${hex8(crc32(bytesOfUtf8(s)))}`;
}
