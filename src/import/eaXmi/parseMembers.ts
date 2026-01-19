import type { ImportReport } from '../importReport';

import { attr, attrAny, childByLocalName, childrenByLocalName, localName } from '../framework/xml';
import { resolveById, resolveHrefId } from './resolve';
import { getXmiIdRef } from './xmi';

// Keep the shape compatible with src/domain/uml/members.ts
export type EaXmiUmlParameter = {
  name: string;
  type?: string;
};

export type EaXmiUmlAttribute = {
  name: string;
  type?: string;
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

function resolveTypeName(index: Map<string, Element>, typeRef: string | undefined | null): string | undefined {
  const ref = (typeRef ?? '').trim();
  if (!ref) return undefined;

  // If it's an href, try fragment.
  const hrefId = resolveHrefId(ref);
  const id = hrefId ?? ref;

  const target = resolveById(index, id);
  if (target) {
    const name = (attr(target, 'name') ?? '').trim();
    if (name) return name;
  }

  // Fallback: sometimes "type" is already a human-readable token.
  // Be conservative: avoid returning obvious internal ids.
  const looksInternal = id.startsWith('_') || id.startsWith('EAID_') || id.startsWith('EAPK_') || id.startsWith('eaEl_synth_');
  if (looksInternal) return undefined;
  if (id.length > 80) return undefined;
  return id;
}

function readTypeRef(el: Element): string | undefined {
  // Common: type="_id" on ownedAttribute/ownedParameter.
  const direct = attr(el, 'type');
  if (direct && direct.trim()) return direct.trim();

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

function parseOwnedAttributes(
  classifierEl: Element,
  index: Map<string, Element>,
): EaXmiUmlAttribute[] {
  const out: EaXmiUmlAttribute[] = [];
  const attrsEls = childrenByLocalName(classifierEl, 'ownedattribute');
  for (const a of attrsEls) {
    // OwnedAttribute elements might include association ends etc.; we still import basic name/type.
    const name = (attr(a, 'name') ?? '').trim();
    if (!name) continue;
    const vis = asVisibility(attr(a, 'visibility'));
    const isStatic = parseBool(attrAny(a, ['isStatic', 'static']));
    const typeName = resolveTypeName(index, readTypeRef(a));
    const defaultValue = readDefaultValue(a);

    const outAttr: EaXmiUmlAttribute = { name };
    if (typeName) outAttr.type = typeName;
    if (vis) outAttr.visibility = vis;
    if (typeof isStatic === 'boolean' && isStatic) outAttr.isStatic = true;
    if (defaultValue) outAttr.defaultValue = defaultValue;
    out.push(outAttr);
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
      const typeName = resolveTypeName(index, readTypeRef(p));

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
