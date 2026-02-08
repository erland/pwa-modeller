import { normalizeKey, normalizeNs } from '../../domain/taggedValues';
import type { TaggedValue } from '../../domain/types';

export type CuratedTaggedValue = {
  /** Display label, potentially namespace-qualified. */
  label: string;
  /** Render-ready value string. */
  value: string;
};

// Curated allowlist terms (case-insensitive; substring match).
// Keep this list small and human-oriented.
const ALLOWLIST_TERMS = [
  'owner',
  'status',
  'lifecycle',
  'criticality',
  'classification',
  'security',
  'pii',
  'domain',
  'system',
  'source',
  'legal',
  'gdpr',
  'retention',
];

function isMeaningfulKey(key: string): boolean {
  const k = normalizeKey(key).toLowerCase();
  if (!k) return false;
  return ALLOWLIST_TERMS.some((t) => k === t || k.includes(t));
}

function formatValue(tv: TaggedValue): string {
  const raw = (tv.value ?? '').toString().trim();
  if (!raw) return '';

  if (tv.type === 'boolean') {
    const v = raw.toLowerCase();
    if (v === 'true' || v === 'false') return v;
    return raw;
  }

  if (tv.type === 'json') {
    try {
      const parsed = JSON.parse(raw);
      // Prefer compact single-line output to avoid dominating the inspector.
      const s = JSON.stringify(parsed);
      return s;
    } catch {
      return raw;
    }
  }

  // number|string|undefined
  return raw;
}

function formatLabel(tv: TaggedValue): string {
  const ns = normalizeNs(tv.ns);
  const key = normalizeKey(tv.key);
  return ns ? `${ns}:${key}` : key;
}

/**
 * Curate tagged values for the portal inspector.
 *
 * - Only allows a small set of meaningful keys.
 * - Removes empty keys/values.
 * - Preserves the original order.
 */
export function curateTaggedValues(taggedValues: TaggedValue[] | undefined): CuratedTaggedValue[] {
  const curated: CuratedTaggedValue[] = [];

  for (const tv of taggedValues ?? []) {
    if (!tv) continue;
    if (!isMeaningfulKey(tv.key)) continue;
    const label = formatLabel(tv);
    const value = formatValue(tv);
    if (!label || !value) continue;
    curated.push({ label, value });
  }

  return curated;
}
