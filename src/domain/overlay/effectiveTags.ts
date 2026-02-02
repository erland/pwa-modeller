import type { TaggedValue, TaggedValueType } from '../types';

import { normalizeKey } from '../taggedValues';
import type { OverlayTagValue } from './types';

/** Namespace used when rendering overlay tags as TaggedValue rows in the UI. */
export const OVERLAY_TAG_NS = 'overlay' as const;

export type OverlayTagStringified = {
  type: TaggedValueType;
  value: string;
};

export type EffectiveTaggedValuesResult = {
  /** Tagged values after applying overlay override semantics (overlay wins by key). */
  effective: TaggedValue[];
  /** Tag keys for which overlay overrides at least one core tagged value. */
  overriddenCoreKeys: string[];
};

function stableOverlayTagId(key: string): string {
  // Deterministic id so UI lists don't churn. Keep it short but stable.
  return `ovl_tag_${fnv1a32(key).slice(0, 12)}`;
}

function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function stringifyOverlayTagValue(v: OverlayTagValue): OverlayTagStringified {
  if (v === null) return { type: 'json', value: 'null' };

  const t = typeof v;
  if (t === 'string') return { type: 'string', value: v as string };
  if (t === 'number') return { type: 'number', value: String(v) };
  if (t === 'boolean') return { type: 'boolean', value: (v as boolean) ? 'true' : 'false' };

  // arrays / objects
  return { type: 'json', value: JSON.stringify(v) };
}

export function overlayTagsToTaggedValues(tags: Record<string, OverlayTagValue> | undefined): TaggedValue[] {
  const out: TaggedValue[] = [];
  for (const [rawKey, value] of Object.entries(tags ?? {})) {
    const key = normalizeKey(rawKey);
    if (!key) continue;
    const s = stringifyOverlayTagValue(value);
    out.push({
      id: stableOverlayTagId(key),
      ns: OVERLAY_TAG_NS,
      key,
      type: s.type,
      value: s.value
    });
  }

  // Stable ordering (key asc) makes diffs predictable and helps tests.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/**
 * Convert tagged value rows (typically edited in the UI) into overlay tag map.
 *
 * - Ignores namespaces.
 * - Drops empty keys.
 * - Last duplicate key wins.
 */
export function taggedValuesToOverlayTags(taggedValues: TaggedValue[] | undefined): Record<string, OverlayTagValue> {
  const out: Record<string, OverlayTagValue> = {};

  for (const tv of taggedValues ?? []) {
    const k = normalizeKey(tv.key);
    if (!k) continue;

    const raw = (tv.value ?? '').toString();
    const type = (tv.type ?? 'string') as TaggedValueType;

    if (type === 'number') {
      const n = Number(raw);
      out[k] = Number.isFinite(n) ? n : raw;
      continue;
    }

    if (type === 'boolean') {
      const s = raw.trim().toLowerCase();
      if (s === 'true') out[k] = true;
      else if (s === 'false') out[k] = false;
      else out[k] = raw;
      continue;
    }

    if (type === 'json') {
      const trimmed = raw.trim();
      if (!trimmed) {
        out[k] = '';
        continue;
      }
      try {
        out[k] = JSON.parse(trimmed) as OverlayTagValue;
      } catch {
        out[k] = raw;
      }
      continue;
    }

    out[k] = raw;
  }

  return out;
}

/**
 * Merge core tagged values with overlay tags.
 *
 * Default ownership policy: overlay wins when a key is present in overlay.
 * Matching is performed by normalized key only (namespaces are ignored).
 */
export function mergeTaggedValuesWithOverlay(
  core: TaggedValue[] | undefined,
  overlayTags: Record<string, OverlayTagValue> | undefined
): EffectiveTaggedValuesResult {
  const overlayList = overlayTagsToTaggedValues(overlayTags);
  const overlayKeys = new Set<string>(overlayList.map((t) => normalizeKey(t.key)));

  const overriddenSet = new Set<string>();
  const coreKept: TaggedValue[] = [];

  for (const tv of core ?? []) {
    const k = normalizeKey(tv.key);
    if (!k) {
      coreKept.push(tv);
      continue;
    }
    if (overlayKeys.has(k)) {
      overriddenSet.add(k);
      continue; // overlay wins: omit overridden core tags from the effective list
    }
    coreKept.push(tv);
  }

  const overriddenCoreKeys = [...overriddenSet.values()].sort();
  return { effective: [...coreKept, ...overlayList], overriddenCoreKeys };
}
