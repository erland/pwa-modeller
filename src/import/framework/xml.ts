/**
 * Namespace-tolerant XML helpers used by importers.
 *
 * Many XML formats (BPMN2, XMI, MEFF) vary in namespace prefixes (bpmn2:, xmi:, uml:, etc.).
 * These helpers match elements by localName (case-insensitive) and tolerate namespaced attributes.
 */

export function isElementNode(n: Node): n is Element {
  return n.nodeType === Node.ELEMENT_NODE;
}

/** Lowercased local name (falls back to tagName). */
export function localName(el: Element): string {
  // DOMParser in browsers normalizes tagName; keep it case-insensitive.
  return (el.localName || el.tagName || '').toLowerCase();
}

/**
 * Attribute getter that tolerates namespaces (e.g. xsi:type) by matching by suffix.
 */
export function attr(el: Element, name: string): string | null {
  const direct = el.getAttribute(name);
  if (direct != null) return direct;

  const needle = name.toLowerCase();
  for (const a of Array.from(el.attributes)) {
    const an = a.name.toLowerCase();
    if (an === needle || an.endsWith(':' + needle)) return a.value;
  }
  return null;
}

/**
 * Like {@link attr} but tries multiple names (useful when tools disagree on attribute casing).
 */
export function attrAny(el: Element, names: string[]): string | null {
  for (const name of names) {
    const v = attr(el, name);
    if (v != null) return v;
  }
  return null;
}

export function requiredAttr(el: Element, name: string, warnings: string[], context?: string): string {
  const v = attr(el, name);
  if (v == null || !v.trim()) {
    warnings.push(`Missing required attribute '${name}'${context ? ` (${context})` : ''}.`);
    return '';
  }
  return v;
}

export function numberAttr(el: Element, name: string, warnings: string[], context?: string): number | null {
  const v = attr(el, name);
  if (v == null || !v.trim()) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    warnings.push(`Invalid number in attribute '${name}': '${v}'${context ? ` (${context})` : ''}.`);
    return null;
  }
  return n;
}

export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').trim();
}

export function childrenByLocalName(parent: Element, childName: string): Element[] {
  const want = childName.toLowerCase();
  const out: Element[] = [];
  for (const c of Array.from(parent.children)) {
    if (localName(c) === want) out.push(c);
  }
  return out;
}

export function childByLocalName(parent: Element, childName: string): Element | null {
  return childrenByLocalName(parent, childName)[0] ?? null;
}

/**
 * First descendant element (depth-first) with matching localName.
 */
export function q(root: ParentNode, name: string): Element | null {
  return qa(root, name)[0] ?? null;
}

/**
 * All descendant elements (depth-first) with matching localName.
 */
export function qa(root: ParentNode, name: string): Element[] {
  const want = name.toLowerCase();
  const out: Element[] = [];

  const walk = (node: ParentNode) => {
    const kids = (node as any).children ? Array.from((node as any).children as HTMLCollectionOf<Element>) : [];
    for (const c of kids) {
      if (localName(c) === want) out.push(c);
      walk(c);
    }
  };

  walk(root);
  return out;
}

/**
 * Prefer an element with xml:lang starting with "en" if present, otherwise the first.
 */
export function pickTextByLang(nodes: Element[]): string {
  if (!nodes.length) return '';
  const en = nodes.find((n) =>
    (n.getAttribute('xml:lang') || n.getAttribute('lang') || '').toLowerCase().startsWith('en')
  );
  return (en ?? nodes[0]).textContent?.trim() ?? '';
}

/**
 * Returns the textContent for the first direct child with a matching localName.
 * If multiple matches exist, prefers xml:lang=en.
 */
export function childText(el: Element, childTag: string): string | null {
  const tag = childTag.toLowerCase();
  const matches: Element[] = [];
  for (const c of Array.from(el.children)) {
    if (localName(c) === tag) matches.push(c);
  }
  if (!matches.length) return null;
  const txt = pickTextByLang(matches).trim();
  return txt.length ? txt : null;
}

/**
 * Common convention: type is expressed using xsi:type or type.
 */
export function getType(el: Element): string | null {
  return attrAny(el, ['xsi:type', 'type']);
}

export function parseXmlLenient(xmlText: string): { doc: Document; parserError: string | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // DOMParser signals parse errors using a <parsererror> element.
  const pe = doc.getElementsByTagName('parsererror')[0];
  if (pe) {
    const msg = (pe.textContent ?? 'XML parse error').trim();
    return { doc, parserError: msg };
  }

  return { doc, parserError: null };
}

export function parseXml(xmlText: string): Document {
  const { doc, parserError } = parseXmlLenient(xmlText);
  if (parserError) throw new Error(parserError);
  return doc;
}
