import { normalizeKey, normalizeNs } from '../../domain/taggedValues';
import type { TaggedValue } from '../../domain/types';

export type CuratedTaggedValue = {
  /** Display label, potentially namespace-qualified. */
  label: string;
  /** Render-ready value string. */
  value: string;
};

// Curated allowlist terms.
//
// Notes:
// - Case-insensitive; substring match.
// - We also do a light "ASCII fold" (remove diacritics) so Swedish keys like
//   "Ägare" and "Källa" can match reliably.
// - Keep this list small and human-oriented (the goal is to show *metadata*,
//   not dump all tool/vendor noise).
const ALLOWLIST_TERMS = [
  // English
  'owner',
  'status',
  'lifecycle',
  'criticality',
  'classification',
  'security',
  'confidential',
  'pii',
  'personaldata',
  'domain',
  'system',
  'source',
  'legal',
  'gdpr',
  'retention',
  'archive',

  // Swedish (common EA/IG terms)
  'agare',
  'ansvarig',
  'status',
  'livscykel',
  'kritikalitet',
  'klassning',
  'klassificering',
  'informationsklass',
  'sakerhet',
  'sekretess',
  'personuppgift',
  'domän',
  'doman',
  'system',
  'kalla',
  'juridik',
  'gallring',
  'bevarande',
];

function foldKey(s: string): string {
  // NFD + strip diacritics to make matching less brittle across languages.
  // (Safe in modern browsers; falls back to original string if unsupported.)
  try {
    return s
      .normalize('NFD')
      // eslint-disable-next-line no-control-regex
      .replace(/\p{Diacritic}+/gu, '')
      .toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function isMeaningfulKey(key: string): boolean {
  const k = foldKey(normalizeKey(key));
  if (!k) return false;
  return ALLOWLIST_TERMS.some((t) => {
    const tt = foldKey(t);
    return k === tt || k.includes(tt);
  });
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
