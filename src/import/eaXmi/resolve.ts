import { getXmiId } from './xmi';

/**
 * Build a lookup table from XMI ids to their corresponding XML elements.
 *
 * The index is intentionally forgiving:
 * - Accepts both `xmi:id` and unprefixed `id`.
 * - Keeps the first element seen for a given id.
 */
export function buildXmiIdIndex(doc: Document): Map<string, Element> {
  const index = new Map<string, Element>();

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    const id = getXmiId(el);
    if (id && !index.has(id)) index.set(id, el);
  }

  return index;
}

export function resolveById(index: Map<string, Element>, id: string | undefined | null): Element | undefined {
  const k = (id ?? '').trim();
  if (!k) return undefined;
  return index.get(k);
}

/**
 * Parses XMI IDREF lists (commonly whitespace-separated).
 */
export function parseIdRefList(value: string | undefined | null): string[] {
  const v = (value ?? '').trim();
  if (!v) return [];
  return v
    .split(/\s+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract the fragment id from an href.
 * Example: "somefile.xmi#_abc" => "_abc".
 */
export function resolveHrefId(href: string | undefined | null): string | undefined {
  const h = (href ?? '').trim();
  if (!h) return undefined;
  const idx = h.lastIndexOf('#');
  if (idx < 0) return undefined;
  const frag = h.slice(idx + 1).trim();
  return frag ? frag : undefined;
}
