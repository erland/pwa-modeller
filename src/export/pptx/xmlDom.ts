export type PptxXmlNs = { p: string; a: string };

/**
 * Resolve the common PresentationML (p) and DrawingML (a) namespaces.
 * PowerPoint slide XML sometimes omits explicit prefixes, so we fall back
 * to the document's root namespace when needed.
 */
export function getPptxNs(doc: Document): PptxXmlNs {
  const root = doc.documentElement;
  const p =
    root.lookupNamespaceURI('p') ??
    root.namespaceURI ??
    'http://schemas.openxmlformats.org/presentationml/2006/main';
  const a = root.lookupNamespaceURI('a') ?? 'http://schemas.openxmlformats.org/drawingml/2006/main';
  return { p, a };
}

export function createEl(doc: Document, ns: string, qname: string): Element {
  return doc.createElementNS(ns, qname);
}

/**
 * Breadth-first-ish search by localName across the subtree.
 * Implemented with an explicit stack to avoid relying on XPath support.
 */
export function findFirstByLocalName(root: Element, localName: string): Element | null {
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === localName) return el;
    for (let i = 0; i < el.children.length; i++) stack.push(el.children[i]);
  }
  return null;
}

export function findAllByLocalName(root: Element, localName: string): Element[] {
  const out: Element[] = [];
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === localName) out.push(el);
    for (let i = 0; i < el.children.length; i++) stack.push(el.children[i]);
  }
  return out;
}

export function readNumAttr(el: Element | null, name: string): number | null {
  if (!el) return null;
  const v = el.getAttribute(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
