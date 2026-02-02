import { externalKey } from '../externalIds';
import type { ExternalIdRef } from '../types';
import type { OverlayExternalRef, OverlayExternalRefSet } from './types';

function parseScheme(scheme: string): { system: string; scope?: string } {
  const raw = (scheme ?? '').toString().trim();
  if (!raw) return { system: '' };
  const at = raw.indexOf('@');
  if (at <= 0) return { system: raw };
  const system = raw.slice(0, at).trim();
  const scope = raw.slice(at + 1).trim();
  return { system, scope: scope ? scope : undefined };
}

/**
 * Convert an overlay on-disk ref to the app's internal `ExternalIdRef`.
 *
 * Notes:
 * - `scheme` maps to `system`.
 * - `value` maps to `id`.
 * - If `scheme` is `"<system>@<scope>"`, scope is preserved.
 */
export function toExternalIdRef(ref: OverlayExternalRef): ExternalIdRef {
  const scheme = (ref?.scheme ?? '').toString().trim();
  const value = (ref?.value ?? '').toString().trim();
  const { system, scope } = parseScheme(scheme);
  return { system, id: value, scope };
}

/** Convert an internal `ExternalIdRef` to an overlay on-disk ref. */
export function toOverlayExternalRef(ref: ExternalIdRef): OverlayExternalRef {
  const system = (ref?.system ?? '').toString().trim();
  const id = (ref?.id ?? '').toString().trim();
  const scope = (ref?.scope ?? '').toString().trim();

  const scheme = scope ? `${system}@${scope}` : system;
  return { scheme, value: id };
}

function isOverlayExternalRef(x: unknown): x is OverlayExternalRef {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<OverlayExternalRef>;
  return typeof r.scheme === 'string' && typeof r.value === 'string';
}

/**
 * Normalize and dedupe overlay refs.
 *
 * - Drops invalid entries (empty system or id after trimming).
 * - Dedupe by `externalKey(toExternalIdRef(ref))`.
 * - Stably sorts by the derived external key.
 */
export function normalizeOverlayRefs(refs: unknown): OverlayExternalRefSet {
  const list = Array.isArray(refs) ? refs : [];

  const map = new Map<string, ExternalIdRef>();
  for (const item of list) {
    if (!isOverlayExternalRef(item)) continue;
    const internal = toExternalIdRef(item);
    const system = (internal.system ?? '').toString().trim();
    const id = (internal.id ?? '').toString().trim();
    if (!system || !id) continue;
    // Normalize values (trim) and keep the last occurrence for a key.
    const norm: ExternalIdRef = {
      system,
      id,
      scope: internal.scope ? internal.scope.toString().trim() : undefined
    };
    const k = externalKey(norm);
    map.set(k, norm);
  }

  // IMPORTANT: Do not use localeCompare here.
  // We want deterministic ordering that matches JS default `Array.prototype.sort()`
  // semantics (codepoint/UTF-16 order), regardless of runtime locale.
  const items = [...map.values()].sort((a, b) => {
    const ak = externalKey(a);
    const bk = externalKey(b);
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    return 0;
  });

  return items.map((r) => toOverlayExternalRef(r));
}

/** Convenience helper: derive the canonical matching key for an overlay ref. */
export function overlayExternalKey(ref: OverlayExternalRef): string {
  return externalKey(toExternalIdRef(ref));
}
