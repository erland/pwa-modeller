import { OVERLAY_FILE_FORMAT_V1 } from './types';
import type { OverlayEntry, OverlayExternalRef, OverlayFile, OverlayTarget } from './types';

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

export function isOverlayExternalRef(x: unknown): x is OverlayExternalRef {
  if (!isRecord(x)) return false;
  return typeof x.scheme === 'string' && typeof x.value === 'string';
}

export function isOverlayTarget(x: unknown): x is OverlayTarget {
  if (!isRecord(x)) return false;
  if (x.kind !== 'element' && x.kind !== 'relationship') return false;
  if (!Array.isArray(x.externalRefs)) return false;
  return x.externalRefs.every(isOverlayExternalRef);
}

export function isOverlayEntry(x: unknown): x is OverlayEntry {
  if (!isRecord(x)) return false;
  if ('entryId' in x && typeof (x as any).entryId !== 'string') return false;
  if (!isOverlayTarget(x.target)) return false;
  if (!isRecord(x.tags)) return false;
  // Tags are JSON-ish; we do a light structural check only.
  return true;
}

/**
 * Light validation of overlay file structure.
 *
 * Security note: this is intentionally shallow; deeper validation (e.g. tag value shape)
 * can be added later at import time if needed.
 */
export function isOverlayFile(x: unknown): x is OverlayFile {
  if (!isRecord(x)) return false;
  if (typeof x.format !== 'string') return false;
  if (x.format !== OVERLAY_FILE_FORMAT_V1) return false;
  if (typeof x.createdAt !== 'string') return false;
  if (!Array.isArray(x.entries)) return false;
  return x.entries.every(isOverlayEntry);
}
