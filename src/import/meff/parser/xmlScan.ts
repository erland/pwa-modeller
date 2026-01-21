import { localName } from '../../framework/xml';

/**
 * MEFF exporters sometimes prefix/namespace tags. These helpers match by localName.
 */
export function findFirstByLocalName(doc: Document, names: string[]): Element | undefined {
  const want = new Set(names.map((n) => n.toLowerCase()));

  const root = doc.documentElement;
  if (root && want.has(localName(root))) return root;

  const all = Array.from(doc.getElementsByTagName('*')) as Element[];
  for (const el of all) {
    if (want.has(localName(el))) return el;
  }

  return undefined;
}

export function hasDescendantWithLocalName(root: Element, names: string[]): boolean {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const el of Array.from(root.getElementsByTagName('*')) as Element[]) {
    if (want.has(localName(el))) return true;
  }
  return false;
}
