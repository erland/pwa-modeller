import type { ImportReport } from '../importReport';
import type { IRRelationship } from '../framework/ir';

import { attr, attrAny, childText, localName } from '../framework/xml';
import { buildXmiIdIndex, parseIdRefList, resolveById, resolveHrefId } from './resolve';
import { getXmiId, getXmiIdRef, getXmiType } from './xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;

type UmlAssociationEndMeta = {
  endId: string;
  /** The classifier referenced by this association end's `type` (i.e., the opposite classifier). */
  typeClassifierId?: string;

  /** The classifier that owns this end when it appears as an `ownedAttribute` on a classifier (UML2 style). */
  ownerClassifierId?: string;
  role?: string;
  multiplicity?: string;
  navigable?: boolean;
  aggregation?: 'none' | 'shared' | 'composite';
};

function resolveOwningClassifierIdForEnd(endEl: Element, index: Map<string, Element>): string | undefined {
  // In UML2 XMI, ends can be represented as <ownedAttribute> under the owning classifier.
  // If so, use the owning classifier as the endpoint.
  const ln = localName(endEl);
  if (ln !== 'ownedattribute') return undefined;

  const p = endEl.parentElement;
  if (!p) return undefined;

  const pid = getXmiId(p) ?? getXmiIdRef(p);
  if (!pid) return undefined;

  // Validate that the parent is a classifier-ish element.
  const pt = (getXmiType(p) ?? '').toLowerCase();
  if (pt === 'uml:class' || pt === 'uml:interface' || pt === 'uml:associationclass' || pt === 'uml:datatype') {
    return pid;
  }

  // Some variants omit xmi:type but keep local names like packagedElement/class/interface.
  const pln = localName(p);
  if (pln === 'packagedelement' || pln === 'ownedmember' || pln === 'class' || pln === 'interface' || pln === 'datatype') {
    // Be defensive: if we can resolve the parent id in the index, accept it.
    if (resolveById(index, pid)) return pid;
    return pid;
  }

  return undefined;
}

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
      const bodyChild = childText(ch, 'body')?.trim();
      if (bodyChild) return bodyChild;
      const bodyAttr = attrAny(ch, ['body'])?.trim();
      if (bodyAttr) return bodyAttr;
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

  // UML2 XMI (non-EA) often omits explicit `isNavigable` and `navigableOwnedEnd`.
  // In those exports, navigability is implied by ownership: an end that is an
  // ownedAttribute on a classifier is navigable from that classifier.
  const inferNavigableFromOwnership = (): boolean => {
    const ln = localName(endEl);
    if (ln !== 'ownedattribute') return false;
    const p = endEl.parentElement;
    if (!p) return false;
    const pt = (getXmiType(p) ?? '').toLowerCase();
    if (pt === 'uml:class' || pt === 'uml:interface' || pt === 'uml:associationclass') return true;
    // Some XMI variants omit xmi:type on classifier elements but keep local name.
    const pln = localName(p);
    return pln === 'packagedelement' || pln === 'ownedmember' || pln === 'class' || pln === 'interface';
  };

  const navigable =
    typeof isNavAttr === 'string'
      ? isNavAttr.trim().toLowerCase() === 'true'
      : navigableOwnedEnds.has(endId) || inferNavigableFromOwnership();

  const typeClassifierId = resolveClassifierIdFromEnd(endEl, index);
  const ownerClassifierId = resolveOwningClassifierIdForEnd(endEl, index);

  return {
    endId,
    typeClassifierId,
    ownerClassifierId,
    role,
    multiplicity,
    navigable,
    aggregation,
  };
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

  // Two-pass index of UML Property elements so that memberEnd references can be
  // resolved even when the referenced Property is not directly reachable via
  // the generic XMI id index (some tool exports use indirect forms).
  //
  // We intentionally index both association-owned ends (<ownedEnd>) and
  // classifier-owned ends (<ownedAttribute>), plus any explicit uml:Property.
  const propertyById = new Map<string, Element>();
  {
    const allEls = doc.getElementsByTagName('*');
    for (let i = 0; i < allEls.length; i++) {
      const e = allEls.item(i);
      if (!e) continue;
      const id = getXmiId(e) ?? getXmiIdRef(e);
      if (!id) continue;
      const xmiType = (getXmiType(e) ?? '').toLowerCase();
      const ln = localName(e);
      const looksLikeProperty = xmiType === 'uml:property' || ln === 'ownedattribute' || ln === 'ownedend';
      if (!looksLikeProperty) continue;
      if (!propertyById.has(id)) propertyById.set(id, e);
    }
  }

  const resolveEndElement = (endId: string): Element | undefined => {
    const byXmi = resolveById(index, endId);
    if (byXmi) return byXmi;
    return propertyById.get(endId);
  };
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
      const endEl = resolveEndElement(endId);
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
      const endEl = resolveEndElement(endId);
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
    // We must be able to resolve the *typed* classifiers of both ends to draw a relationship.
    // Note: In UML2-style exports, ends may be owned by participating classifiers (ownedAttribute)
    // but the association still connects the two *types* (e.g., Customer.address connects
    // Customer <-> Address, not Customer <-> Customer).
    if (!endA.typeClassifierId || !endB.typeClassifierId) {
      report.warnings.push(
        `EA XMI: Skipped Association because end types could not be resolved (endA=${endA.typeClassifierId ?? '∅'}, endB=${endB.typeClassifierId ?? '∅'}).`
      );
      continue;
    }

    const assocBaseId = getXmiId(el) ?? getXmiIdRef(el);
    let id = assocBaseId;
    if (!id) {
      synthCounter++;
      id = `eaAssoc_synth_${synthCounter}`;
    }
    // Avoid potential element-id collisions for AssociationClass by namespacing the relationship id.
    if (isAssociationClass) {
      // Relationship id must not collide with the AssociationClass element id.
      const baseId = assocBaseId ?? id;
      id = `${baseId}__association`;
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

    // We can only create a relationship if both ends resolve to typed classifiers.
    // (In UML2 XMI, ends are often ownedAttributes on classes but their @type points to the opposite classifier.)
    if (!endA.typeClassifierId || !endB.typeClassifierId) {
      continue;
    }

    // Our IR has directed relationships for rendering. For UML associations we derive
    // a stable direction:
    // - composition/aggregation: source = whole/aggregator, target = part
    // - plain association: source = declaring classifier (ownedAttribute) when present, else stable by end order
    let sourceId: string;
    let targetId: string;
    let srcMeta: UmlAssociationEndMeta;
    let tgtMeta: UmlAssociationEndMeta;

    if (hasComposite || hasShared) {
      const aggKind: UmlAssociationEndMeta['aggregation'] = hasComposite ? 'composite' : 'shared';
      const wholeEnd = endA.aggregation === aggKind ? endA : endB;
      const otherEnd = wholeEnd === endA ? endB : endA;

      // Composition/Aggregation needs special handling because UML XMI has (at least) two common encodings:
      //  1) Ends are classifier-owned attributes (UML2 style):
      //       Customer owns Property "orders" typed Order, and that Property has aggregation="composite".
      //     Here, the WHOLE is the *owning classifier* (Customer) and the PART is the *type* (Order).
      //  2) Ends are association-owned <ownedEnd/> elements (common in EA exports and fixtures):
      //       The composite/shared mark is placed on the WHOLE end.
      //     Here, we keep legacy behaviour: WHOLE is the *type of the aggregated end*.
      //
      // Due to the guard above, both ends have typeClassifierId.
      const wholeClassifierId: string = wholeEnd.ownerClassifierId ? wholeEnd.ownerClassifierId : wholeEnd.typeClassifierId!;
      const partClassifierId: string = wholeEnd.ownerClassifierId ? wholeEnd.typeClassifierId! : otherEnd.typeClassifierId!;

      // Sanity: avoid emitting broken relationships if something is missing.
      if (!wholeClassifierId || !partClassifierId) {
        continue;
      }

      sourceId = wholeClassifierId;
      targetId = partClassifierId;

      // Side metadata (role/multiplicity/navigability) should follow the chosen oriented ends.
      // For both encodings we treat the aggregated end as the source-side metadata carrier.
      srcMeta = wholeEnd;
      tgtMeta = otherEnd;
    } else {
      // Plain association: prefer direction from a declaring classifier (ownedAttribute) to the referenced type.
      if (endA.ownerClassifierId) {
        sourceId = endA.ownerClassifierId;
        targetId = endA.typeClassifierId;
        srcMeta = endA;
        tgtMeta = endB.ownerClassifierId === targetId ? endB : endB;
      } else if (endB.ownerClassifierId) {
        sourceId = endB.ownerClassifierId;
        targetId = endB.typeClassifierId;
        srcMeta = endB;
        tgtMeta = endA.ownerClassifierId === targetId ? endA : endA;
      } else {
        sourceId = endA.typeClassifierId;
        targetId = endB.typeClassifierId;
        srcMeta = endA;
        tgtMeta = endB;
      }

      // Guard against accidental self-loops when ownership inference is present but the end type is the same.
      if (sourceId === targetId) {
        sourceId = endA.typeClassifierId;
        targetId = endB.typeClassifierId;
        srcMeta = endA;
        tgtMeta = endB;
      }
    }


    
    // Normalize which association-end metadata is attached to source/target for display.
    // The diagram labels should be anchored by the *end type* (classifier at that end), not by edge orientation.
    //
    // SELF-ASSOCIATIONS:
    // When sourceId === targetId, both ends typically have the same typeClassifierId and type-based matching becomes ambiguous.
    // In that case, pick a deterministic tie-break so we keep BOTH end labels (one on source, one on target).
    let srcLabelEnd: UmlAssociationEndMeta;
    let tgtLabelEnd: UmlAssociationEndMeta;
    if (sourceId === targetId) {
      const ends = [endA, endB].slice().sort((a, b) => a.endId.localeCompare(b.endId));
      srcLabelEnd = ends[0];
      tgtLabelEnd = ends[1];
    } else {
      srcLabelEnd = (endA.typeClassifierId === sourceId ? endA : (endB.typeClassifierId === sourceId ? endB : srcMeta));
      tgtLabelEnd = (endA.typeClassifierId === targetId ? endA : (endB.typeClassifierId === targetId ? endB : tgtMeta));
    }

const externalIds = [
      ...(getXmiId(el) ? [{ system: 'xmi', id: getXmiId(el)!, kind: 'xmi-id' }] : []),
      ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'relationship-guid' }] : []),
    ];
    const taggedValues = [...(stereotype ? [{ key: 'stereotype', value: stereotype }] : [])];

    relationships.push({
      id,
      type,
      sourceId,
      targetId,
      ...(isAssociationClass && assocBaseId ? { attrs: { associationClassElementId: assocBaseId } } : {}),
      name,
      documentation: docText,
      ...(externalIds.length ? { externalIds } : {}),
      ...(taggedValues.length ? { taggedValues } : {}),
      meta: {
        ...(xmiType ? { xmiType } : {}),
        metaclass: isAssociationClass ? 'AssociationClass' : 'Association',
        umlAttrs: {
          ...(srcLabelEnd.role ? { sourceRole: srcLabelEnd.role } : {}),
          ...(tgtLabelEnd.role ? { targetRole: tgtLabelEnd.role } : {}),
          ...(srcLabelEnd.multiplicity ? { sourceMultiplicity: srcLabelEnd.multiplicity } : {}),
          ...(tgtLabelEnd.multiplicity ? { targetMultiplicity: tgtLabelEnd.multiplicity } : {}),
          ...(typeof srcLabelEnd.navigable === 'boolean' ? { sourceNavigable: srcLabelEnd.navigable } : {}),
          ...(typeof tgtLabelEnd.navigable === 'boolean' ? { targetNavigable: tgtLabelEnd.navigable } : {}),
          ...(stereotype ? { stereotype } : {}),
        }
      }
    });
  }

  return { relationships };
}
