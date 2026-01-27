import type { ImportReport } from '../importReport';

import { attr, attrAny, childByLocalName, childrenByLocalName, localName } from '../framework/xml';
import { resolveById, resolveHrefId } from './resolve';
import { getXmiId, getXmiIdRef } from './xmi';

// Keep the shape compatible with src/domain/uml/members.ts
export type EaXmiUmlParameter = {
  name: string;
  type?: string;
};

export type EaXmiUmlMultiplicity = {
  lower?: string;
  upper?: string;
};

export type EaXmiUmlAttribute = {
  name: string;
  /** UML metaclass for this attribute (typically 'uml:Property'). */
  metaclass?: string;
  /** Raw XMI reference id for the datatype/classifier (if available). */
  dataTypeRef?: string;
  /** Resolved datatype/classifier name (if available). */
  dataTypeName?: string;
  multiplicity?: EaXmiUmlMultiplicity;
  visibility?: 'public' | 'private' | 'protected' | 'package';
  isStatic?: boolean;
  defaultValue?: string;
};

export type EaXmiUmlOperation = {
  name: string;
  returnType?: string;
  visibility?: 'public' | 'private' | 'protected' | 'package';
  params?: EaXmiUmlParameter[];
  isStatic?: boolean;
  isAbstract?: boolean;
};

export type EaXmiUmlClassifierMembers = {
  attributes: EaXmiUmlAttribute[];
  operations: EaXmiUmlOperation[];
};

function parseBool(v: string | null | undefined): boolean | undefined {
  const s = (v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return undefined;
}

function asVisibility(v: string | null | undefined): 'public' | 'private' | 'protected' | 'package' | undefined {
  switch ((v ?? '').trim()) {
    case 'public':
    case 'private':
    case 'protected':
    case 'package':
      return (v ?? '').trim() as any;
    default:
      return undefined;
  }
}

function looksLikeInternalId(id: string): boolean {
  return (
    id.startsWith('_') ||
    id.startsWith('EAID_') ||
    id.startsWith('EAPK_') ||
    id.startsWith('eaEl_synth_') ||
    id.startsWith('EAGen_')
  );
}

function isHumanReadableTypeToken(s: string | undefined | null): boolean {
  const v = (s ?? '').trim();
  if (!v) return false;
  if (v.length > 120) return false;
  // HREFs are handled explicitly elsewhere; treat them as non-human-readable here.
  if (v.includes('://')) return false;
  // Never treat UML/XMI metaclass tokens as datatypes.
  // These commonly leak in from xmi:type attributes (e.g. 'uml:Property').
  if (v.startsWith('uml:') || v.startsWith('xmi:')) return false;
  if (looksLikeInternalId(v)) return false;
  return true;
}

function tryResolvePrimitiveTypeNameFromHref(href: string): string | undefined {
  const s = href.trim();
  if (!s) return undefined;
  if (!s.includes('://')) return undefined;

  // Common patterns:
  // - http://schema.omg.org/spec/UML/2.1/String
  // - http://schema.omg.org/spec/UML/2.1/Types.xmi#String
  // - …#Integer
  const afterHash = s.includes('#') ? s.split('#').pop() : undefined;
  const tail = afterHash && afterHash.trim() ? afterHash.trim() : s.split('/').filter(Boolean).pop();
  const token = (tail ?? '').trim();
  if (!token) return undefined;

  // Avoid returning UML metaclasses from the profile (e.g. 'Property', 'Class').
  // Those are types of UML elements, not datatypes.
  // NOTE: This is intentionally conservative; expand later if needed.
  const FORBIDDEN = new Set(['Property', 'Class', 'Association', 'Dependency', 'Activity', 'Artifact', 'Generalization']);
  if (FORBIDDEN.has(token)) return undefined;

  // Primitive-ish tokens we want to surface (String, Boolean, Integer, …)
  if (!isHumanReadableTypeToken(token)) return undefined;
  return token;
}

function tryResolveTypeNameFromElementContext(attributeEl: Element): string | undefined {
  // EA sometimes puts the human-readable datatype on a nested <properties> element.
  // Example (varies by export profile):
  // <ownedAttribute … type="EAID_…">
  //   <properties type="String" />
  // </ownedAttribute>
  const props = childByLocalName(attributeEl, 'properties');
  if (props) {
    const t = attrAny(props, ['type', 'datatype', 'dataType', 'typename', 'typeName', 'classifier', 'classifierName']);
    if (isHumanReadableTypeToken(t)) return (t ?? '').trim();
  }

  // Another common pattern: <type name="String" … />
  const typeChild = childByLocalName(attributeEl, 'type');
  if (typeChild) {
    const n = attrAny(typeChild, ['name', 'type', 'typename', 'typeName']);
    if (isHumanReadableTypeToken(n)) return (n ?? '').trim();
  }

  // Heuristic: scan for tagged-value like structures.
  // We keep this conservative and only accept obvious keys.
  const KEY_CANDIDATES = new Set(['type', 'datatype', 'datatypename', 'typename', 'classifier', 'classifiername']);
  const all = attributeEl.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    const key = (attrAny(el, ['tag', 'name', 'key']) ?? '').trim().toLowerCase();
    if (!key || !KEY_CANDIDATES.has(key)) continue;

    const val = attrAny(el, ['value', 'val', 'body', 'text']) ?? el.textContent;
    if (isHumanReadableTypeToken(val)) return (val ?? '').trim();
  }

  return undefined;
}

function resolveTypeName(
  index: Map<string, Element>,
  typeRef: string | undefined | null,
  contextEl?: Element,
): string | undefined {
  const ref = (typeRef ?? '').trim();
  if (!ref) return undefined;

  // If it's an href URL, try to extract a primitive type name.
  // This is common in EA exports for UML primitive types.
  const primitiveFromHref = tryResolvePrimitiveTypeNameFromHref(ref);
  if (primitiveFromHref) return primitiveFromHref;

  // If it's an href, try fragment.
  const hrefId = resolveHrefId(ref);
  const id = hrefId ?? ref;

  const target = resolveById(index, id);
  if (target) {
    const name = (attr(target, 'name') ?? '').trim();
    if (name) return name;
  }

  // If resolution failed, attempt a conservative fallback using the local element context.
  // This helps for EA exports where the referenced type classifier isn't present in the XMI,
  // but a human-readable type token exists nearby (e.g. in a <properties> node).
  if (contextEl) {
    const ctxType = tryResolveTypeNameFromElementContext(contextEl);
    if (ctxType) return ctxType;
  }

  // Fallback: sometimes "type" is already a human-readable token (e.g. "String").
  // Be conservative: avoid returning obvious internal ids.
  if (!isHumanReadableTypeToken(id)) return undefined;
  return id;
}

function readTypeRef(el: Element): string | undefined {
  // Common: type="_id" on ownedAttribute/ownedParameter.
  const direct = attr(el, 'type');
  // Some XML helpers resolve by localName and will pick up xmi:type here.
  // If that happens, we MUST ignore it (metaclass is not a datatype ref).
  if (direct && direct.trim()) {
    const v = direct.trim();
    if (!v.startsWith('uml:') && !v.startsWith('xmi:')) return v;
  }

  // Alternative: <type xmi:idref="_id" />
  const t = childByLocalName(el, 'type');
  if (t) {
    const idref = getXmiIdRef(t);
    if (idref) return idref;
    const href = attrAny(t, ['href']);
    if (href && href.trim()) return href.trim();
  }

  return undefined;
}

function readMultiplicity(el: Element): EaXmiUmlMultiplicity | undefined {
  const lowerEl = childByLocalName(el, 'lowervalue');
  const upperEl = childByLocalName(el, 'uppervalue');

  const lower = (lowerEl ? attrAny(lowerEl, ['value', 'body']) : null);
  const upper = (upperEl ? attrAny(upperEl, ['value', 'body']) : null);

  const lowerS = (lower ?? '').trim();
  let upperS = (upper ?? '').trim();

  // EA uses -1 for UML's "unlimited" upper bound.
  // We store it as '*' for display friendliness.
  if (upperS === '-1') upperS = '*';

  if (!lowerS && !upperS) return undefined;

  const out: EaXmiUmlMultiplicity = {};
  if (lowerS) out.lower = lowerS;
  if (upperS) out.upper = upperS;
  return out;
}

function readDefaultValue(el: Element): string | undefined {
  const dv = childByLocalName(el, 'defaultvalue');
  if (!dv) return undefined;

  // Often: <defaultValue value="42" />
  const v = attrAny(dv, ['value', 'body']);
  const s = (v ?? '').trim();
  if (s) return s;

  // Or nested <value>text</value>
  const valueChild = childByLocalName(dv, 'value');
  const t = (valueChild?.textContent ?? dv.textContent ?? '').trim();
  return t || undefined;
}

function parseAttributeLikeElement(
  attributeEl: Element,
  index: Map<string, Element>,
): EaXmiUmlAttribute | undefined {
  // Attribute elements might be <ownedAttribute> or referenced nodes elsewhere (e.g. uml:Property).
  const name = (attr(attributeEl, 'name') ?? '').trim();
  if (!name) return undefined;

  const vis = asVisibility(attr(attributeEl, 'visibility'));
  const isStatic = parseBool(attrAny(attributeEl, ['isStatic', 'static']));
  const typeRef = readTypeRef(attributeEl);
  const typeName = resolveTypeName(index, typeRef, attributeEl);
  const multiplicity = readMultiplicity(attributeEl);
  const defaultValue = readDefaultValue(attributeEl);

  const outAttr: EaXmiUmlAttribute = { name };
  // Step 6 refactor: keep datatype fields explicit.
  outAttr.metaclass = 'uml:Property';
  if (typeRef) outAttr.dataTypeRef = typeRef;
  if (typeName) outAttr.dataTypeName = typeName;
  if (multiplicity) outAttr.multiplicity = multiplicity;
  if (vis) outAttr.visibility = vis;
  if (typeof isStatic === 'boolean' && isStatic) outAttr.isStatic = true;
  if (defaultValue) outAttr.defaultValue = defaultValue;
  return outAttr;
}

function parseOwnedAttributes(
  classifierEl: Element,
  index: Map<string, Element>,
): EaXmiUmlAttribute[] {
  const out: EaXmiUmlAttribute[] = [];
  const seenIds = new Set<string>();

  const attrsEls = childrenByLocalName(classifierEl, 'ownedattribute');
  for (const a of attrsEls) {
    const id = getXmiId(a);
    if (id) seenIds.add(id);

    const parsed = parseAttributeLikeElement(a, index);
    if (parsed) out.push(parsed);
  }

  // Sparx EA sometimes uses a wrapper structure:
  // <attributes>
  //   <attribute xmi:idref="…" />
  // </attributes>
  // where the actual uml:Property node exists elsewhere in the document.
  const wrappers = childrenByLocalName(classifierEl, 'attributes');
  for (const wrapper of wrappers) {
    const refs = childrenByLocalName(wrapper, 'attribute');
    for (const refEl of refs) {
      const idref = getXmiIdRef(refEl);
      if (!idref) continue;
      if (seenIds.has(idref)) continue;

      const resolved = resolveById(index, idref);
      if (!resolved) continue;

      seenIds.add(idref);
      const parsed = parseAttributeLikeElement(resolved, index);
      if (parsed) out.push(parsed);
    }
  }

  return out;
}

function parseOwnedOperations(
  classifierEl: Element,
  index: Map<string, Element>,
): EaXmiUmlOperation[] {
  const out: EaXmiUmlOperation[] = [];
  const opEls = childrenByLocalName(classifierEl, 'ownedoperation');
  for (const o of opEls) {
    const name = (attr(o, 'name') ?? '').trim();
    if (!name) continue;
    const vis = asVisibility(attr(o, 'visibility'));
    const isStatic = parseBool(attrAny(o, ['isStatic', 'static']));
    const isAbstract = parseBool(attrAny(o, ['isAbstract', 'abstract']));

    const params: EaXmiUmlParameter[] = [];
    let returnType: string | undefined;

    const pEls = childrenByLocalName(o, 'ownedparameter');
    for (const p of pEls) {
      const dir = (attr(p, 'direction') ?? '').trim();
      const typeName = resolveTypeName(index, readTypeRef(p), p);

      if (dir === 'return') {
        if (typeName) returnType = typeName;
        continue;
      }

      const pn = (attr(p, 'name') ?? '').trim();
      if (!pn) continue;

      const param: EaXmiUmlParameter = { name: pn };
      if (typeName) param.type = typeName;
      params.push(param);
    }

    const op: EaXmiUmlOperation = { name };
    if (returnType) op.returnType = returnType;
    if (vis) op.visibility = vis;
    if (params.length) op.params = params;
    if (typeof isStatic === 'boolean' && isStatic) op.isStatic = true;
    if (typeof isAbstract === 'boolean' && isAbstract) op.isAbstract = true;
    out.push(op);
  }
  return out;
}

/**
 * Step 6: Parse classifier members (attributes, operations, parameters).
 */
export function parseEaXmiClassifierMembers(
  classifierEl: Element,
  index: Map<string, Element>,
  report: ImportReport,
): EaXmiUmlClassifierMembers {
  // Defensive check: ensure we're on something that looks like a classifier.
  const ln = localName(classifierEl);
  if (!ln) {
    report.warnings.push('EA XMI: parseEaXmiClassifierMembers called with element that has no localName.');
  }

  const attributes = parseOwnedAttributes(classifierEl, index);
  const operations = parseOwnedOperations(classifierEl, index);

  return { attributes, operations };
}
