function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeItem(s: string): string {
  return s.trim();
}

/**
 * Parse a comma separated stereotype string into a stable list.
 *
 * - Trims whitespace
 * - Drops empty entries
 * - De-duplicates (case-insensitive) while preserving first-seen casing/order
 */
export function parseStereotypeCsv(text: string): string[] {
  const parts = text
    .split(',')
    .map((p) => normalizeItem(p))
    .filter((p) => p.length > 0);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function stereotypesToCsv(list: string[]): string {
  return list.join(', ');
}

function stripGuillemets(s: string): string {
  const t = s.trim();
  if (t.startsWith('<<') && t.endsWith('>>') && t.length >= 4) {
    return t.slice(2, -2).trim();
  }
  return t;
}

/**
 * Convert a fully-qualified stereotype name (Profile::Stereotype) into a short display name.
 */
export function toStereotypeDisplayName(stereotype: string): string {
  const noChevrons = stripGuillemets(stereotype);
  const idx = noChevrons.lastIndexOf('::');
  return idx >= 0 ? noChevrons.slice(idx + 2) : noChevrons;
}

/**
 * Display stereotypes as a comma-separated list, using short names (no qualifiers).
 */
export function stereotypesToDisplayCsv(list: string[]): string {
  return list.map((s) => toStereotypeDisplayName(s)).filter(Boolean).join(', ');
}

/**
 * Read stereotypes from attrs.
 *
 * Canonical storage is attrs.stereotypes (string[]).
 */
export function readStereotypes(attrs: unknown): string[] {
  if (!isRecord(attrs)) return [];

  const rawList = attrs.stereotypes;
  if (!Array.isArray(rawList)) return [];

  const list = rawList
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);

  // Reuse the CSV parser for de-duping + stable normalization
  return list.length ? parseStereotypeCsv(list.join(',')) : [];
}

/**
 * Write stereotypes into a new attrs object.
 */
export function writeStereotypes(base: Record<string, unknown>, list: string[]): Record<string, unknown> {
  const cleaned = list.map((s) => s.trim()).filter(Boolean);
  const next: Record<string, unknown> = { ...base };

  if (cleaned.length) {
    next.stereotypes = cleaned;
  } else {
    delete next.stereotypes;
  }

  // Remove legacy field if present
  delete next.stereotype;

  return next;
}

/**
 * Convenience for displaying stereotypes as a single string.
 */
export function readStereotypeText(attrs: unknown): string {
  const list = readStereotypes(attrs);
  return list.length ? stereotypesToCsv(list) : '';
}

export function readStereotypeDisplayText(attrs: unknown): string {
  const list = readStereotypes(attrs);
  return list.length ? stereotypesToDisplayCsv(list) : '';
}
