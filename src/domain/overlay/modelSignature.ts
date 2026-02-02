import type { Model } from '../types';
import { dedupeExternalIds, externalKey } from '../externalIds';

function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV-1a: h *= 16777619
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function stableExternalKeysForModel(model: Model): string[] {
  const out: string[] = [];

  for (const el of Object.values(model.elements)) {
    for (const r of dedupeExternalIds(el.externalIds ?? [])) {
      const k = externalKey(r);
      if (k) out.push(k);
    }
  }

  for (const rel of Object.values(model.relationships)) {
    for (const r of dedupeExternalIds(rel.externalIds ?? [])) {
      const k = externalKey(r);
      if (k) out.push(k);
    }
  }

  // Deterministic ordering + dedupe.
  out.sort();
  return Array.from(new Set(out));
}

/**
 * Compute a stable model signature used to persist overlays.
 *
 * Primary strategy: hash of all externalKey() values across elements + relationships.
 * Fallback: hash internal ids (less stable across imports, but better than nothing).
 */
export function computeModelSignature(model: Model): string {
  const keys = stableExternalKeysForModel(model);
  if (keys.length > 0) {
    const raw = `basis=externalKeys\ncount=${keys.length}\n${keys.join('\n')}`;
    return `ext-${fnv1a32(raw)}`;
  }

  const elIds = Object.keys(model.elements).slice().sort((a, b) => a.localeCompare(b));
  const relIds = Object.keys(model.relationships).slice().sort((a, b) => a.localeCompare(b));
  const raw = `basis=internalIds\nE=${elIds.join(',')}\nR=${relIds.join(',')}`;
  return `int-${fnv1a32(raw)}`;
}
