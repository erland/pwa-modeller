import type { ImportReport } from '../importReport';
import type { IRRelationship } from '../framework/ir';

import { attr, attrAny, childText, localName } from '../framework/xml';
import { buildXmiIdIndex, parseIdRefList, resolveById, resolveHrefId } from './resolve';
import { getXmiId, getXmiIdRef, getXmiType } from './xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;

type UmlAssociationEndMeta = {
  endId: string;
  classifierId?: string;
  role?: string;
  multiplicity?: string;
  navigable?: boolean;
  aggregation?: 'none' | 'shared' | 'composite';
};

function getEaGuid(el: Element): string | undefined {
  const v = attrAny(el, [...EA_GUID_ATTRS]);
  const s = v?.trim();
  return s ? s : undefined;
}

function getStereotype(el: Element): string | undefined {
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

function extractDocumentation(el: Element): string | undefined {
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

function coerceMultiplicity(lower: string | undefined, upper: string | undefined): string | undefined {
  const l = (lower ?? '').trim();
  const u = (upper ?? '').trim();
  if (!l && !u) return undefined;
  const ll = l || '0';
  const uu = u || ll;
  if (ll === uu) return ll;
  return `${ll}..${uu}`;
}

function parseMultiplicity(endEl: Element): string | undefined {
  // Prefer UML value elements: <lowerValue value="0"/> etc.
  let lower: string | undefined;
  let upper: string | undefined;

  for (const ch of Array.from(endEl.children)) {
    const ln = localName(ch);
    if (ln === 'lowervalue') {
      const v = attrAny(ch, ['value', 'xmi:value']);
      if (v != null) lower = v;
    } else if (ln === 'uppervalue') {
      const v = attrAny(ch, ['value', 'xmi:value']);
      if (v != null) upper = v;
    }
  }

  // Fallbacks seen in some exports.
  if (lower == null) {
    const v = attrAny(endEl, ['lower']);
    if (v != null) lower = v;
  }
  if (upper == null) {
    const v = attrAny(endEl, ['upper']);
    if (v != null) upper = v;
  }

  return coerceMultiplicity(lower, upper);
}

function parseNavigableOwnedEnds(assocEl: Element): Set<string> {
  const out = new Set<string>();

  const attrValue = attrAny(assocEl, ['navigableOwnedEnd', 'navigableownedend']);
  for (const id of parseIdRefList(attrValue)) out.add(id);

  for (const ch of Array.from(assocEl.children)) {
    if (localName(ch) !== 'navigableownedend') continue;
    const idref = getXmiIdRef(ch);
    if (idref) out.add(idref);
    const href = attrAny(ch, ['href']);
    const frag = resolveHrefId(href);
    if (frag) out.add(frag);
  }

  return out;
}

function resolveClassifierIdFromEnd(endEl: Element, index: Map<string, Element>): string | undefined {
  // Typical UML: ownedEnd/@type or memberEnd element has @type
  const direct = attrAny(endEl, ['type']);
  if (direct) {
    const first = parseIdRefList(direct)[0];
    if (first) return first;
  }

  // Some forms: <type xmi:idref="…"/> or <type href="…#id"/>
  for (const ch of Array.from(endEl.children)) {
    if (localName(ch) !== 'type') continue;
    const idref = getXmiIdRef(ch);
    if (idref) return idref;
    const href = attrAny(ch, ['href']);
    const frag = resolveHrefId(href);
    if (frag) return frag;
  }

  // As an extremely defensive fallback, if this end has a "type" child with text.
  const typeText = childText(endEl, 'type')?.trim();
  if (typeText) {
    const first = parseIdRefList(typeText)[0];
    if (first) return first;
  }

  // Try resolving EA-style reference stored as properties.
  const maybe = attrAny(endEl, ['classifier', 'class']);
  if (maybe) {
    const first = parseIdRefList(maybe)[0];
    if (first && resolveById(index, first)) return first;
  }

  return undefined;
}

function parseEnd(endEl: Element, index: Map<string, Element>, navigableOwnedEnds: Set<string>): UmlAssociationEndMeta | undefined {
  const endId = getXmiId(endEl) ?? getXmiIdRef(endEl);
  if (!endId) return undefined;

  const role = (attr(endEl, 'name') ?? '').trim() || undefined;
  const multiplicity = parseMultiplicity(endEl);
  const aggregationRaw = (attrAny(endEl, ['aggregation']) ?? '').trim().toLowerCase();
  const aggregation: UmlAssociationEndMeta['aggregation'] =
    aggregationRaw === 'composite'
      ? 'composite'
      : aggregationRaw === 'shared'
        ? 'shared'
        : 'none';

  const isNavAttr = attrAny(endEl, ['isNavigable', 'isnavigable']);
  const navigable =
    typeof isNavAttr === 'string'
      ? isNavAttr.trim().toLowerCase() === 'true'
      : navigableOwnedEnds.has(endId);

  const classifierId = resolveClassifierIdFromEnd(endEl, index);

  return { endId, classifierId, role, multiplicity, navigable, aggregation };
}

export type ParseEaXmiAssociationsResult = {
  relationships: IRRelationship[];
};

/**
 * Step 8: Parse associations + end metadata (roles, multiplicity, navigability).
 */
export function parseEaXmiAssociations(doc: Document, report: ImportReport): ParseEaXmiAssociationsResult {
  const relationships: IRRelationship[] = [];
  const index = buildXmiIdIndex(doc);
  const seenIds = new Set<string>();
  let synthCounter = 0;

  // Extra lookup used for AssociationClass: EA may represent one or both ends as
  // ownedAttributes on participating classifiers with an `association="<assocId>"` reference.
  const associationIdToPropertyEls = new Map<string, Element[]>();
  {
    const allForIndex = doc.getElementsByTagName('*');
    for (let i = 0; i < allForIndex.length; i++) {
      const e = allForIndex.item(i);
      if (!e) continue;
      const assoc = (attrAny(e, ['association', 'Association']) ?? '').trim();
      if (!assoc) continue;
      // Only keep elements that look like properties (most often ownedAttribute).
      const xmiType = (getXmiType(e) ?? '').toLowerCase();
      const ln = localName(e);
      const looksLikeProperty = xmiType === 'uml:property' || ln === 'ownedattribute' || ln === 'ownedend';
      if (!looksLikeProperty) continue;

      const arr = associationIdToPropertyEls.get(assoc) ?? [];
      arr.push(e);
      associationIdToPropertyEls.set(assoc, arr);
    }
  }

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    const xmiType = getXmiType(el);
    const xmiTypeLower = (xmiType ?? '').toLowerCase();
    const isAssociation = xmiTypeLower === 'uml:association' || localName(el) === 'association';
    const isAssociationClass = xmiTypeLower === 'uml:associationclass';
    if (!isAssociation && !isAssociationClass) continue;

    const navigableOwnedEnds = parseNavigableOwnedEnds(el);

    // Collect ends from memberEnd references.
    const ends: Element[] = [];
    const memberEndAttr = attrAny(el, ['memberEnd', 'memberend']);
    for (const endId of parseIdRefList(memberEndAttr)) {
      const endEl = resolveById(index, endId);
      if (endEl) ends.push(endEl);
    }

    // Also support child form: <memberEnd xmi:idref="…"/> or <memberEnd href="…#id"/>.
    for (const ch of Array.from(el.children)) {
      if (localName(ch) !== 'memberend') continue;
      const idref = getXmiIdRef(ch);
      const href = attrAny(ch, ['href']);
      const frag = resolveHrefId(href);
      const endId = idref ?? frag;
      if (!endId) continue;
      const endEl = resolveById(index, endId);
      if (endEl) ends.push(endEl);
    }

    // Also include direct ownedEnd children.
    for (const ch of Array.from(el.children)) {
      if (localName(ch) === 'ownedend') ends.push(ch);
    }

    // AssociationClass fallback: if memberEnd/ownedEnd does not yield enough ends,
    // try to find ends via ownedAttributes that reference this association id.
    if (isAssociationClass) {
      const assocId = getXmiId(el) ?? getXmiIdRef(el);
      if (assocId) {
        const byAssoc = associationIdToPropertyEls.get(assocId) ?? [];
        for (const p of byAssoc) ends.push(p);
      }
    }

    // Normalize: unique by end id, keep first occurrence.
    const uniqueById = new Map<string, Element>();
    for (const endEl of ends) {
      const id = getXmiId(endEl) ?? getXmiIdRef(endEl);
      if (id && !uniqueById.has(id)) uniqueById.set(id, endEl);
    }
    const endEls = Array.from(uniqueById.values());

    if (endEls.length < 2) {
      report.warnings.push('EA XMI: Skipped Association because fewer than 2 ends could be resolved.');
      continue;
    }
    if (endEls.length > 2) {
      report.warnings.push(
        `EA XMI: Association has ${endEls.length} ends; only the first 2 will be imported as a binary association.`
      );
    }

    const endA = parseEnd(endEls[0]!, index, navigableOwnedEnds);
    const endB = parseEnd(endEls[1]!, index, navigableOwnedEnds);
    if (!endA || !endB) {
      report.warnings.push('EA XMI: Skipped Association because end metadata could not be parsed.');
      continue;
    }
    if (!endA.classifierId || !endB.classifierId) {
      report.warnings.push(
        `EA XMI: Skipped Association because classifier endpoints could not be resolved (endA=${endA.classifierId ?? '∅'}, endB=${endB.classifierId ?? '∅'}).`
      );
      continue;
    }

    let id = getXmiId(el) ?? getXmiIdRef(el);
    if (!id) {
      synthCounter++;
      id = `eaAssoc_synth_${synthCounter}`;
    }
    // Avoid potential element-id collisions for AssociationClass by namespacing the relationship id.
    if (isAssociationClass) {
      id = `${id}__association`;
    }
    if (seenIds.has(id)) {
      report.warnings.push(`EA XMI: Duplicate association id "${id}" encountered; skipping.`);
      continue;
    }
    seenIds.add(id);

    const eaGuid = getEaGuid(el);
    const stereotype = getStereotype(el);
    const docText = extractDocumentation(el);
    const name = (attr(el, 'name') ?? '').trim() || undefined;

    // Choose relationship type based on aggregation/composition.
    const hasComposite = endA.aggregation === 'composite' || endB.aggregation === 'composite';
    const hasShared = endA.aggregation === 'shared' || endB.aggregation === 'shared';
    const type = hasComposite ? 'uml.composition' : hasShared ? 'uml.aggregation' : 'uml.association';

    const externalIds = [
      ...(getXmiId(el) ? [{ system: 'xmi', id: getXmiId(el)!, kind: 'xmi-id' }] : []),
      ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'relationship-guid' }] : []),
    ];
    const taggedValues = [...(stereotype ? [{ key: 'stereotype', value: stereotype }] : [])];

    relationships.push({
      id,
      type,
      sourceId: endA.classifierId,
      targetId: endB.classifierId,
      name,
      documentation: docText,
      ...(externalIds.length ? { externalIds } : {}),
      ...(taggedValues.length ? { taggedValues } : {}),
      meta: {
        ...(xmiType ? { xmiType } : {}),
        metaclass: isAssociationClass ? 'AssociationClass' : 'Association',
        umlAttrs: {
          ...(endA.role ? { sourceRole: endA.role } : {}),
          ...(endB.role ? { targetRole: endB.role } : {}),
          ...(endA.multiplicity ? { sourceMultiplicity: endA.multiplicity } : {}),
          ...(endB.multiplicity ? { targetMultiplicity: endB.multiplicity } : {}),
          ...(typeof endA.navigable === 'boolean' ? { sourceNavigable: endA.navigable } : {}),
          ...(typeof endB.navigable === 'boolean' ? { targetNavigable: endB.navigable } : {}),
          ...(stereotype ? { stereotype } : {}),
        }
      }
    });
  }

  return { relationships };
}
