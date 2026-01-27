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


/**
 * Build a lookup table from XMI ids to human-readable names.
 *
 * EA sometimes stores  * - Vendor-extension records: `<properties name="…">` (rare but seen in the wild)
 *
 * We keep this index permissive and prefer the first name we find.
 */
export function buildXmiIdToNameIndex(doc: Document, idIndex?: Map<string, Element>): Map<string, string> {
  const index = idIndex ?? buildXmiIdIndex(doc);
  const out = new Map<string, string>();

  const pick = (id: string, name: string | undefined) => {
    const n = (name ?? '').trim();
    if (!n) return;
    if (!out.has(id)) out.set(id, n);
  };

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    const id = getXmiId(el);
    if (!id) continue;

    // 1) Most UML elements put the name on the element itself.
    const direct = (el.getAttribute('name') ?? '').trim();
    if (direct) {
      pick(id, direct);
      continue;
    }

    // 2) EA vendor extensions may place name on a <properties> child.
    for (const ch of Array.from(el.children)) {
      if ((ch.localName ?? ch.nodeName) === 'properties') {
        const pn = (ch.getAttribute('name') ?? '').trim();
        if (pn) {
          pick(id, pn);
          break;
        }
      }
    }
  }

  // Ensure the map includes known EA primitive/profile ids if present in the idIndex.
  // (No-op when not present.)
  for (const [id, el] of index.entries()) {
    if (out.has(id)) continue;
    const direct = (el.getAttribute('name') ?? '').trim();
    if (direct) out.set(id, direct);
  }

  return out;
}
