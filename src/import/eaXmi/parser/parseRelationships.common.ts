import { attr, attrAny, childText, localName } from '../../framework/xml';
import { parseIdRefList, resolveHrefId } from '../resolve';
import { getXmiId, getXmiIdRef, getXmiType } from '../xmi';
import type { IRRelationship } from '../../framework/ir';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;

// Written by parseElements.ts when a classifier lacks xmi:id.
const SYNTH_ELEMENT_ID_ATTR = 'data-import-element-id';

export type ParseEaXmiRelationshipsResult = {
  relationships: IRRelationship[];
};

export function buildXmiIdIndex(doc: Document): Map<string, Element> {
  // DOM getElementById() does NOT work reliably for XMI, because xmi:id is not declared as an XML ID type.
  // Build a best-effort index from xmi:id -> element for quick base_* lookups.
  const xmiIdIndex = new Map<string, Element>();
  const allForIndex = doc.getElementsByTagName('*');
  for (let i = 0; i < allForIndex.length; i++) {
    const e = allForIndex.item(i);
    if (!e) continue;
    const id = getXmiId(e);
    if (id && !xmiIdIndex.has(id)) xmiIdIndex.set(id, e);
  }
  return xmiIdIndex;
}

export function metaClassFromXmiType(xmiType: string | undefined): string | undefined {
  const t = (xmiType ?? '').trim();
  if (!t) return undefined;
  const idx = t.indexOf(':');
  return idx >= 0 ? t.slice(idx + 1).trim() : t;
}

export function normalizeMetaClassFromLocalName(ln: string): string | undefined {
  // localName() helper lowercases.
  switch ((ln ?? '').toLowerCase()) {
    case 'generalization':
      return 'Generalization';
    case 'realization':
      return 'Realization';
    case 'interfacerealization':
      return 'InterfaceRealization';
    case 'dependency':
      return 'Dependency';
    case 'include':
      return 'Include';
    case 'extend':
      return 'Extend';
    case 'controlflow':
      return 'ControlFlow';
    case 'objectflow':
      return 'ObjectFlow';
    default:
      return undefined;
  }
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
  return undefined;
}

export function getEaTypeHint(el: Element): string | undefined {
  // EA sometimes stores connector type hints as <properties ea_type="ControlFlow" …/>.
  const direct = attrAny(el, ['ea_type', 'ea:ea_type', 'type'])?.trim();
  if (direct) return direct;

  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const v = attrAny(ch, ['ea_type', 'ea:ea_type', 'type'])?.trim();
      if (v) return v;
    }
  }
  return undefined;
}

export function extractDocumentation(el: Element): string | undefined {
  // Common UML structure: <ownedComment><body>…</body></ownedComment>
  for (const ch of Array.from(el.children)) {
    const ln = localName(ch);
    // EA sometimes places <body> directly under the element.
    if (ln === 'body') {
      const t = (ch.textContent ?? '').trim();
      if (t) return t;
    }
    if (ln === 'ownedcomment' || ln === 'comment') {
      const body = childText(ch, 'body')?.trim();
      if (body) return body;
    }
  }

  const attrDoc = attrAny(el, ['documentation', 'doc', 'notes', 'note'])?.trim();
  if (attrDoc) return attrDoc;

  return undefined;
}

export function resolveRefIds(el: Element, key: string): string[] {
  // Prefer attribute form.
  const direct = attrAny(el, [key, key.toLowerCase(), key.toUpperCase()]);
  if (direct) return parseIdRefList(direct);

  // Then common child reference patterns: <key xmi:idref="…"/> or <key href="…#id"/>
  for (const ch of Array.from(el.children)) {
    if (localName(ch) !== key.toLowerCase()) continue;
    const idref = getXmiIdRef(ch);
    if (idref) return [idref];
    const href = attrAny(ch, ['href']);
    const frag = resolveHrefId(href);
    if (frag) return [frag];
  }

  return [];
}

export function parseEndpointsForMetaclass(el: Element, metaclass: string): { sources: string[]; targets: string[] } {
  switch (metaclass) {
    case 'Generalization': {
      const sources = resolveRefIds(el, 'specific');
      const targets = resolveRefIds(el, 'general');
      return { sources, targets };
    }
    case 'Include': {
      const sources = resolveRefIds(el, 'includingCase');
      const targets = resolveRefIds(el, 'addition');
      if (sources.length || targets.length) return { sources, targets };
      // Fallback (some exports encode include as dependency-like client/supplier)
      return {
        sources: resolveRefIds(el, 'client'),
        targets: resolveRefIds(el, 'supplier'),
      };
    }
    case 'Extend': {
      const sources = resolveRefIds(el, 'extension');
      const targets = resolveRefIds(el, 'extendedCase');
      if (sources.length || targets.length) return { sources, targets };
      return {
        sources: resolveRefIds(el, 'client'),
        targets: resolveRefIds(el, 'supplier'),
      };
    }
    case 'Dependency':
    case 'Realization':
    case 'InterfaceRealization': {
      return {
        sources: resolveRefIds(el, 'client'),
        targets: resolveRefIds(el, 'supplier'),
      };
    }
    case 'ControlFlow':
    case 'ObjectFlow': {
      // UML ActivityEdge endpoints are usually exported as source/target.
      const sources = resolveRefIds(el, 'source');
      const targets = resolveRefIds(el, 'target');
      if (sources.length || targets.length) return { sources, targets };
      // Some exports may fall back to client/supplier.
      return {
        sources: resolveRefIds(el, 'client'),
        targets: resolveRefIds(el, 'supplier'),
      };
    }
    default:
      return { sources: [], targets: [] };
  }
}

export function isInsideXmiExtension(el: Element): boolean {
  let p: Element | null = el.parentElement;
  while (p) {
    if (localName(p) === 'extension') return true;
    p = p.parentElement;
  }
  return false;
}

export function isArchiMateProfileNamespace(el: Element): boolean {
  const uri = (el.namespaceURI ?? '').toString().toLowerCase();
  if (!uri) return false;
  return uri.includes('sparxsystems.com/profiles/archimate');
}

export function isBpmnProfileNamespace(el: Element): boolean {
  const uri = (el.namespaceURI ?? '').toString().toLowerCase();
  if (!uri) return false;
  return uri.includes('sparxsystems.com/profiles/bpmn');
}

export function getBaseRefId(el: Element): string | undefined {
  const direct = attrAny(el, [
    'base_Association',
    'base_Dependency',
    'base_Relationship',
    'base_Connector',
    'base_association',
    'base_dependency',
    'base_relationship',
    'base_connector',
    'base',
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
  return undefined;
}

export function resolveEndpointId(el: Element, keys: string[]): string | undefined {
  // Attribute form first.
  for (const k of keys) {
    const v = attrAny(el, [k, k.toLowerCase(), k.toUpperCase()]);
    if (v && v.trim()) return v.trim();
  }

  // Child form: <source xmi:idref="…"/> or <source href="…#id"/>
  for (const ch of Array.from(el.children)) {
    const ln = localName(ch);
    if (!keys.map((k) => k.toLowerCase()).includes(ln)) continue;
    const idref = getXmiIdRef(ch);
    if (idref) return idref;
    const href = attrAny(ch, ['href']);
    const frag = resolveHrefId(href);
    if (frag) return frag;
  }

  return undefined;
}

function coerceTrimmedString(v: string | null | undefined): string | undefined {
  const s = (v ?? '').trim();
  return s.length ? s : undefined;
}

/**
 * Best-effort extraction of UML ActivityEdge guard text.
 *
 * Typical UML/XMI forms:
 * - <guard><specification xmi:type="uml:OpaqueExpression" body="x > 0" /></guard>
 * - <guard><specification><body>…</body></specification></guard>
 * - EA extensions may store a guard-like value as an attribute.
 */
export function extractUmlGuardText(edgeEl: Element): string | undefined {
  // Attribute form (rare but cheap to check)
  const attrGuard = coerceTrimmedString(attrAny(edgeEl, ['guard', 'Guard']));
  if (attrGuard) return attrGuard;

  // EA sometimes puts additional metadata on a <properties> child.
  for (const ch of Array.from(edgeEl.children)) {
    if (localName(ch) !== 'properties') continue;
    const g = coerceTrimmedString(attrAny(ch, ['guard', 'Guard', 'condition', 'Condition']));
    if (g) return g;
  }

  // UML canonical child form
  for (const guardEl of Array.from(edgeEl.children)) {
    if (localName(guardEl) !== 'guard') continue;

    // <guard xmi:idref="…"/> doesn't help here.
    // Look for a nested specification/body.
    for (const spec of Array.from(guardEl.getElementsByTagName('*'))) {
      const ln = localName(spec);
      if (ln !== 'specification' && ln !== 'body') continue;

      const bodyAttr = coerceTrimmedString(attrAny(spec, ['body']));
      if (bodyAttr) return bodyAttr;

      if (ln === 'body') {
        const txt = coerceTrimmedString(spec.textContent ?? undefined);
        if (txt) return txt;
      }
    }

    const guardText = coerceTrimmedString(guardEl.textContent ?? undefined);
    if (guardText) return guardText;
  }

  return undefined;
}

export function findOwningClassifierId(el: Element): string | undefined {
  let p: Element | null = el.parentElement;
  while (p) {
    const xmiType = (getXmiType(p) ?? '').toLowerCase();
    if (xmiType.startsWith('uml:')) {
      const metaclass = metaClassFromXmiType(getXmiType(p));
      // Consider any non-package UML classifier as an owning classifier.
      if (metaclass && metaclass.toLowerCase() !== 'package') {
        return getXmiId(p) ?? attr(p, SYNTH_ELEMENT_ID_ATTR) ?? undefined;
      }
    }
    p = p.parentElement;
  }
  return undefined;
}
