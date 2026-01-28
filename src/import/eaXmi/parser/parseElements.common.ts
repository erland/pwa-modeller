import type { ImportReport } from '../../importReport';
import type { IRElement } from '../../framework/ir';

import { attr, attrAny, childText, localName } from '../../framework/xml';
import { getXmiId, getXmiType } from '../xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;

// Written by parsePackages.ts when a package lacks xmi:id.
export const SYNTH_FOLDER_ID_ATTR = 'data-import-folder-id';
// Internal marker for elements that lack xmi:id (useful for later relationship parsing).
export const SYNTH_ELEMENT_ID_ATTR = 'data-import-element-id';

export type ParseEaXmiElementsResult = {
  elements: IRElement[];
};

export type EaClassifierIR = {
  id: string;
  type: string;
  name: string;
  documentation?: string;
  folderId?: string;
  externalIds?: { system: string; id: string; kind: string }[];
  taggedValues?: { key: string; value: string }[];
  attrs?: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type EaProfileElementIR = {
  id: string;
  type: string;
  name: string;
  documentation?: string;
  folderId?: string;
  externalIds?: { system: string; id: string; kind: string }[];
  taggedValues?: { key: string; value: string }[];
  meta: Record<string, unknown>;
};

export function classifierIrToElement(ir: EaClassifierIR): IRElement {
  return {
    id: ir.id,
    type: ir.type,
    name: ir.name,
    ...(ir.documentation ? { documentation: ir.documentation } : {}),
    ...(ir.folderId ? { folderId: ir.folderId } : {}),
    ...(ir.externalIds?.length ? { externalIds: ir.externalIds } : {}),
    ...(ir.taggedValues?.length ? { taggedValues: ir.taggedValues } : {}),
    ...(ir.attrs ? { attrs: ir.attrs } : {}),
    meta: ir.meta,
  };
}

export function profileElementIrToElement(ir: EaProfileElementIR): IRElement {
  return {
    id: ir.id,
    type: ir.type,
    name: ir.name,
    ...(ir.documentation ? { documentation: ir.documentation } : {}),
    ...(ir.folderId ? { folderId: ir.folderId } : {}),
    ...(ir.externalIds?.length ? { externalIds: ir.externalIds } : {}),
    ...(ir.taggedValues?.length ? { taggedValues: ir.taggedValues } : {}),
    meta: ir.meta,
  };
}

export function decodeNumericEntities(input: string): string {
  // EA may emit strings like "beh&#246;vs" (numeric entities) inside attributes.
  // Decode numeric entities to proper Unicode.
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, num) => String.fromCharCode(parseInt(num, 10)));
}

function extractEaExtensionDocumentation(extEl: Element): string | undefined {
  // EA vendor-extension record example: <element xmi:idref="IDREF"><properties documentation="TEXT"/></element>
  for (const ch of Array.from(extEl.children)) {
    if (localName(ch) === 'properties') {
      const pd = attrAny(ch, ['documentation', 'doc', 'notes', 'note'])?.trim();
      if (pd) return decodeNumericEntities(pd);
    }
  }
  return undefined;
}

export function buildEaExtensionDocumentationIndex(doc: Document): Map<string, string> {
  const out = new Map<string, string>();
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    if (!isInsideXmiExtension(el)) continue;
    if (localName(el) !== 'element') continue;

    const idref = attrAny(el, ['xmi:idref', 'idref'])?.trim();
    if (!idref) continue;

    const docText = extractEaExtensionDocumentation(el);
    if (docText) out.set(idref, docText);
  }
  return out;
}

export function metaClassFromXmiType(xmiType: string | undefined): string | undefined {
  const t = (xmiType ?? '').trim();
  if (!t) return undefined;
  const idx = t.indexOf(':');
  return idx >= 0 ? t.slice(idx + 1).trim() : t;
}

export function getEaGuid(el: Element): string | undefined {
  const v = attrAny(el, [...EA_GUID_ATTRS]);
  const s = v?.trim();
  return s ? s : undefined;
}

export function getStereotype(el: Element): string | undefined {
  const direct = attrAny(el, [...STEREOTYPE_ATTRS])?.trim();
  if (direct) return direct;

  // EA often emits a <properties stereotype="…" /> child.
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const st = attrAny(ch, [...STEREOTYPE_ATTRS])?.trim();
      if (st) return st;
    }
  }
  // EA often emits notes/documentation on a <properties> child (very common in Sparx EA exports).
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const pd = attrAny(ch, ['documentation', 'doc', 'notes', 'note'])?.trim();
      if (pd) return pd;
    }
  }

  return undefined;
}

export function extractDocumentation(el: Element, eaExtDocsById?: Map<string, string>): string | undefined {
  // Common UML structure: <ownedComment><body>…</body></ownedComment>
  for (const ch of Array.from(el.children)) {
    const ln = localName(ch);
    // EA sometimes places <body> directly under the element (not wrapped in ownedComment).
    if (ln === 'body') {
      const t = (ch.textContent ?? '').trim();
      if (t) return t;
    }
    if (ln === 'ownedcomment' || ln === 'comment') {
      const body = childText(ch, 'body')?.trim();
      if (body) return body;
    }
  }

  // EA sometimes uses a nested <documentation> element or an attribute.
  const attrDoc = attrAny(el, ['documentation', 'doc', 'notes', 'note'])?.trim();
  if (attrDoc) return attrDoc;

  // Some exports use <ownedComment><body> but ownedComment might be deeper than 1 level.
  const anyOwnedComment = el.getElementsByTagName('ownedComment');
  if (anyOwnedComment && anyOwnedComment.length > 0) {
    const first = anyOwnedComment.item(0);
    if (first) {
      const body = childText(first, 'body')?.trim();
      if (body) return body;
    }
  }

  // EA often emits notes/documentation on a <properties> child (very common in Sparx EA exports).
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const pd = attrAny(ch, ['documentation', 'doc', 'notes', 'note'])?.trim();
      if (pd) return pd;
    }
  }

  // EA may store notes in vendor extensions keyed by xmi:idref.
  if (eaExtDocsById) {
    const xmiId = getXmiId(el);
    if (xmiId) {
      const extDoc = eaExtDocsById.get(xmiId);
      if (extDoc) return extDoc;
    }
  }

  return undefined;
}

export function findOwningPackageFolderId(el: Element): string | undefined {
  let p: Element | null = el.parentElement;
  while (p) {
    const ln = localName(p);
    if (ln === 'package' || ln === 'packagedelement') {
      const t = (getXmiType(p) ?? '').toLowerCase();
      // Only treat as package when explicitly marked as a UML package.
      if (ln === 'package' || t === 'uml:package' || t.endsWith(':package') || t === 'package') {
        return getXmiId(p) ?? attr(p, SYNTH_FOLDER_ID_ATTR) ?? undefined;
      }
    }
    p = p.parentElement;
  }
  // EA often emits notes/documentation on a <properties> child (very common in Sparx EA exports).
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const pd = attrAny(ch, ['documentation', 'doc', 'notes', 'note'])?.trim();
      if (pd) return pd;
    }
  }

  return undefined;
}

export function isInsideXmiExtension(el: Element): boolean {
  // EA (and other tools) place non-UML records such as diagrams, geometry, etc.
  // under <xmi:Extension>. These often carry attributes like type="Class" which are
  // NOT XMI metaclasses and must not be parsed as UML classifiers.
  let p: Element | null = el.parentElement;
  while (p) {
    if (localName(p) === 'extension') return true;
    p = p.parentElement;
  }
  return false;
}

export function getBaseRefId(el: Element): string | undefined {
  // Stereotype application pattern: base_Class / base_Element / base_Classifier, etc.
  // Be forgiving and scan all attributes for a base_* key.
  const direct = attrAny(el, [
    'base_Class',
    'base_Element',
    'base_Classifier',
    'base',
    'base_class',
    'base_element',
    'base_classifier',
  ]);
  if (direct && direct.trim()) return direct.trim();

  for (const a of Array.from(el.attributes ?? [])) {
    const n = (a.name ?? '').toLowerCase();
    if (n === 'base') {
      const v = (a.value ?? '').trim();
      if (v) return v;
    }
    if (n.startsWith('base_')) {
      const v = (a.value ?? '').trim();
      if (v) return v;
    }
  }
  // EA often emits notes/documentation on a <properties> child (very common in Sparx EA exports).
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const pd = attrAny(ch, ['documentation', 'doc', 'notes', 'note'])?.trim();
      if (pd) return pd;
    }
  }

  return undefined;
}

export function warnMissingXmiId(report: ImportReport, message: string): void {
  report.warnings.push(message);
}
