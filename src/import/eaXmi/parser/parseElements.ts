import type { ImportReport } from '../../importReport';
import type { IRElement } from '../../framework/ir';

import { attr, attrAny, childText, localName } from '../../framework/xml';
import {
  getBpmnSourceTypeTokenFromEaProfileTagLocalName,
  getArchimateSourceTypeTokenFromEaProfileTagLocalName,
  inferBpmnElementTypeFromEaProfileTagLocalName,
  inferBpmnRelationshipTypeFromEaProfileTagLocalName,
  inferArchimateElementTypeFromEaProfileTagLocalName,
  inferArchimateRelationshipTypeFromEaProfileTagLocalName,
  inferUmlQualifiedElementTypeFromEaClassifier,
} from '../mapping';
import { buildXmiIdIndex } from '../resolve';
import { parseEaXmiClassifierMembers } from '../parseMembers';
import { getXmiId, getXmiType } from '../xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;


function decodeNumericEntities(input: string): string {
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

function buildEaExtensionDocumentationIndex(doc: Document): Map<string, string> {
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

// Written by parsePackages.ts when a package lacks xmi:id.
const SYNTH_FOLDER_ID_ATTR = 'data-import-folder-id';
// Internal marker for elements that lack xmi:id (useful for later relationship parsing).
const SYNTH_ELEMENT_ID_ATTR = 'data-import-element-id';

function metaClassFromXmiType(xmiType: string | undefined): string | undefined {
  const t = (xmiType ?? '').trim();
  if (!t) return undefined;
  const idx = t.indexOf(':');
  return idx >= 0 ? t.slice(idx + 1).trim() : t;
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
  // EA often emits notes/documentation on a <properties> child (very common in Sparx EA exports).
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === 'properties') {
      const pd = attrAny(ch, ['documentation', 'doc', 'notes', 'note'])?.trim();
      if (pd) return pd;
    }
  }

  return undefined;
}

function extractDocumentation(el: Element, eaExtDocsById?: Map<string, string>): string | undefined {
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

function findOwningPackageFolderId(el: Element): string | undefined {
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

function isClassifierCandidate(el: Element): { metaclass: string; xmiType?: string } | null {
  const xmiType = getXmiType(el);
  const metaclass = metaClassFromXmiType(xmiType) ?? '';
  if (metaclass) {
    // We only accept metaclasses that our mapping knows about.
    const inferred = inferUmlQualifiedElementTypeFromEaClassifier({ metaclass });
    if (inferred && inferred !== 'uml.package') return { metaclass, xmiType };
    return null;
  }

  // Fallback: some tools may emit explicit uml:* tags.
  // Be conservative: only accept when tag localName matches a known UML metaclass.
  const ln = localName(el);
  const inferred = inferUmlQualifiedElementTypeFromEaClassifier({ metaclass: ln });
  if (inferred && inferred !== 'uml.package') return { metaclass: ln, xmiType: undefined };

  return null;
}

function isInsideXmiExtension(el: Element): boolean {
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

export type ParseEaXmiElementsResult = {
  elements: IRElement[];
};

/**
 * Step 5: Parse UML classifiers into IR elements.
 *
 * Policy notes:
 * - UML Packages are NOT turned into elements in Milestone A (packages are folders).
 */
export function parseEaXmiClassifiersToElements(doc: Document, report: ImportReport): ParseEaXmiElementsResult {
  const elements: IRElement[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const idIndex = buildXmiIdIndex(doc);
  const eaExtDocsById = buildEaExtensionDocumentationIndex(doc);

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    // Never treat vendor-extension records (like EA diagrams) as UML classifiers.
    if (isInsideXmiExtension(el)) continue;

    const candidate = isClassifierCandidate(el);
    if (!candidate) continue;

    const qualifiedType = inferUmlQualifiedElementTypeFromEaClassifier({ metaclass: candidate.metaclass });
    if (!qualifiedType) continue;

    let id = getXmiId(el);
    if (!id) {
      synthCounter++;
      id = `eaEl_synth_${synthCounter}`;
      try {
        el.setAttribute(SYNTH_ELEMENT_ID_ATTR, id);
      } catch {
        // ignore
      }
      report.warnings.push(
        `EA XMI: Element missing xmi:id; generated synthetic element id "${id}" (metaclass="${candidate.metaclass}", name="${(attr(el, 'name') ?? '').trim()}").`,
      );
    }

    if (seen.has(id)) {
      report.warnings.push(`EA XMI: Duplicate element id "${id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(id);

    const nameAttr = (attr(el, 'name') ?? '').trim();

    // Comments/notes often store their text in <body>.
    let name = nameAttr;
    const docText = extractDocumentation(el, eaExtDocsById);
    if (!name) {
      if (qualifiedType === 'uml.note' && docText) {
        name = docText.split(/\r?\n/)[0]!.slice(0, 60).trim() || 'Note';
      } else {
        name = candidate.metaclass || 'Element';
      }
    }

    const eaGuid = getEaGuid(el);
    const stereotype = getStereotype(el);
    const folderId = findOwningPackageFolderId(el);

    // Step 6: Classifier members (attributes/operations/params)
    const members =
      qualifiedType === 'uml.class' || qualifiedType === 'uml.interface' || qualifiedType === 'uml.datatype'
        ? parseEaXmiClassifierMembers(el, idIndex, report)
        : undefined;

    const externalIds = [
      // Preserve xmi:id explicitly even though we also use it as IR id.
      ...(getXmiId(el) ? [{ system: 'xmi', id: getXmiId(el)!, kind: 'xmi-id' }] : []),
      ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'element-guid' }] : []),
    ];

    const taggedValues = [
      ...(stereotype ? [{ key: 'stereotype', value: stereotype }] : []),
    ];

    elements.push({
      id,
      type: qualifiedType,
      name,
      documentation: docText,
      ...(folderId ? { folderId } : {}),
      ...(externalIds.length ? { externalIds } : {}),
      ...(taggedValues.length ? { taggedValues } : {}),
      meta: {
        ...(candidate.xmiType ? { xmiType: candidate.xmiType } : {}),
        metaclass: candidate.metaclass,
        ...(members ? { umlMembers: members } : {}),
      },
    });
  }

  return { elements };
}

function isArchiMateProfileNamespace(el: Element): boolean {
  const uri = (el.namespaceURI ?? '').toString().toLowerCase();
  if (!uri) return false;
  // Typical EA ArchiMate profile URIs look like:
  //  - http://www.sparxsystems.com/profiles/ArchiMate3/1.0
  return uri.includes('sparxsystems.com/profiles/archimate');
}

function isBpmnProfileNamespace(el: Element): boolean {
  const uri = (el.namespaceURI ?? '').toString().toLowerCase();
  if (!uri) return false;
  // Typical EA BPMN profile URIs look like:
  //  - http://www.sparxsystems.com/profiles/BPMN2.0/1.0
  return uri.includes('sparxsystems.com/profiles/bpmn');
}

function getBaseRefId(el: Element): string | undefined {
  // Stereotype application pattern: base_Class / base_Element / base_Classifier, etc.
  // Be forgiving and scan all attributes for a base_* key.
  const direct = attrAny(el, ['base_Class', 'base_Element', 'base_Classifier', 'base', 'base_class', 'base_element', 'base_classifier']);
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

/**
 * Step 2 (EA XMI ArchiMate): Parse EA's ArchiMate profile tags into IR elements.
 *
 * This intentionally supports multiple possible encodings:
 *  - Direct profile-tag instances with `xmi:id` (used in fixtures and some exports)
 *  - Stereotype-application pattern with `base_*` references (common UML-profile encoding)
 */
export function parseEaXmiArchiMateProfileElementsToElements(doc: Document, report: ImportReport): ParseEaXmiElementsResult {
  const elements: IRElement[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const idIndex = buildXmiIdIndex(doc);
  const eaExtDocsById = buildEaExtensionDocumentationIndex(doc);

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    if (isInsideXmiExtension(el)) continue;
    if (!isArchiMateProfileNamespace(el)) continue;

    const ln = localName(el);

    // Step 2 imports only ArchiMate *elements*. Relationship tags are handled in Step 3.
    if (inferArchimateRelationshipTypeFromEaProfileTagLocalName(ln)) continue;

    const inferred = inferArchimateElementTypeFromEaProfileTagLocalName(ln);
    const sourceToken = getArchimateSourceTypeTokenFromEaProfileTagLocalName(ln) ?? ln;

    const xmiId = getXmiId(el);
    const baseId = getBaseRefId(el);

    // Prefer base_* reference when present, as other records (relationships, diagrams) often refer to the base id.
    let id = (baseId ?? xmiId)?.trim();
    if (!id) {
      synthCounter++;
      id = `eaArchEl_synth_${synthCounter}`;
      try {
        el.setAttribute(SYNTH_ELEMENT_ID_ATTR, id);
      } catch {
        // ignore
      }
      report.warnings.push(
        `EA XMI: ArchiMate element missing xmi:id; generated synthetic element id "${id}" (profileTag="${el.tagName}", name="${(attr(el, 'name') ?? '').trim()}").`,
      );
    }

    if (seen.has(id)) {
      report.warnings.push(`EA XMI: Duplicate ArchiMate element id "${id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(id);

    let name = (attr(el, 'name') ?? '').trim();
    let documentation = extractDocumentation(el, eaExtDocsById);
    let folderId = findOwningPackageFolderId(el);

    // If this is a stereotype application, pull missing details from the base element.
    if ((!name || !documentation || !folderId) && baseId) {
      const base = idIndex.get(baseId);
      if (base) {
        if (!name) name = (attr(base, 'name') ?? '').trim();
        if (!documentation) documentation = extractDocumentation(base);
        if (!folderId) folderId = findOwningPackageFolderId(base);
      }
    }

    if (!name) name = sourceToken || 'Element';

    const baseEl = baseId ? idIndex.get(baseId) : undefined;
    const eaGuid = getEaGuid(el) ?? (baseEl ? getEaGuid(baseEl) : undefined);

    const externalIds = [
      ...(xmiId ? [{ system: 'xmi', id: xmiId, kind: 'xmi-id' }] : []),
      ...(baseId ? [{ system: 'xmi', id: baseId, kind: 'xmi-base-id' }] : []),
      ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'element-guid' }] : []),
    ];

    // Preserve the profile tag and any stereotype as tagged values.
    const stereotype = getStereotype(el);
    const taggedValues = [
      { key: 'profileTag', value: el.tagName },
      ...(stereotype ? [{ key: 'stereotype', value: stereotype }] : []),
    ];

    // If the type isn't recognized, import as Unknown but preserve the source token.
    const type = inferred ?? 'Unknown';

    elements.push({
      id,
      type,
      name,
      ...(documentation ? { documentation } : {}),
      ...(folderId ? { folderId } : {}),
      ...(externalIds.length ? { externalIds } : {}),
      ...(taggedValues.length ? { taggedValues } : {}),
      meta: {
        archimateProfileUri: el.namespaceURI,
        archimateProfileLocalName: ln,
        archimateProfileTag: el.tagName,
        ...(type === 'Unknown' ? { sourceType: sourceToken } : {}),
      },
    });
  }

  return { elements };
}

/**
 * Step 5A (EA XMI BPMN): Parse EA's BPMN profile tags into IR elements.
 *
 * Supported encodings (best-effort):
 *  - Direct profile-tag instances with `xmi:id`
 *  - Stereotype-application pattern with `base_*` references
 */
export function parseEaXmiBpmnProfileElementsToElements(doc: Document, report: ImportReport): ParseEaXmiElementsResult {
  const elements: IRElement[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const idIndex = buildXmiIdIndex(doc);
  const eaExtDocsById = buildEaExtensionDocumentationIndex(doc);

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    if (isInsideXmiExtension(el)) continue;
    if (!isBpmnProfileNamespace(el)) continue;

    const ln = localName(el);

    // Step 5A imports only BPMN *elements*. Relationship tags are handled in Step 5B.
    if (inferBpmnRelationshipTypeFromEaProfileTagLocalName(ln)) continue;

    const inferred = inferBpmnElementTypeFromEaProfileTagLocalName(ln);
    const sourceToken = getBpmnSourceTypeTokenFromEaProfileTagLocalName(ln) ?? ln;

    const xmiId = getXmiId(el);
    const baseId = getBaseRefId(el);

    // Prefer base_* reference when present.
    let id = (baseId ?? xmiId)?.trim();
    if (!id) {
      synthCounter++;
      id = `eaBpmnEl_synth_${synthCounter}`;
      try {
        el.setAttribute(SYNTH_ELEMENT_ID_ATTR, id);
      } catch {
        // ignore
      }
      report.warnings.push(
        `EA XMI: BPMN element missing xmi:id; generated synthetic element id "${id}" (profileTag="${el.tagName}", name="${(attr(el, 'name') ?? '').trim()}").`,
      );
    }

    if (seen.has(id)) {
      report.warnings.push(`EA XMI: Duplicate BPMN element id "${id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(id);

    let name = (attr(el, 'name') ?? '').trim();
    let documentation = extractDocumentation(el, eaExtDocsById);
    let folderId = findOwningPackageFolderId(el);

    // If this is a stereotype application, pull missing details from the base element.
    if ((!name || !documentation || !folderId) && baseId) {
      const base = idIndex.get(baseId);
      if (base) {
        if (!name) name = (attr(base, 'name') ?? '').trim();
        if (!documentation) documentation = extractDocumentation(base);
        if (!folderId) folderId = findOwningPackageFolderId(base);
      }
    }

    if (!name) name = sourceToken || 'Element';

    const baseEl = baseId ? idIndex.get(baseId) : undefined;
    const eaGuid = getEaGuid(el) ?? (baseEl ? getEaGuid(baseEl) : undefined);

    const externalIds = [
      ...(xmiId ? [{ system: 'xmi', id: xmiId, kind: 'xmi-id' }] : []),
      ...(baseId ? [{ system: 'xmi', id: baseId, kind: 'xmi-base-id' }] : []),
      ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'element-guid' }] : []),
    ];

    const stereotype = getStereotype(el);
    const taggedValues = [
      { key: 'profileTag', value: el.tagName },
      ...(stereotype ? [{ key: 'stereotype', value: stereotype }] : []),
    ];

    const type = inferred ?? 'Unknown';

    elements.push({
      id,
      type,
      name,
      ...(documentation ? { documentation } : {}),
      ...(folderId ? { folderId } : {}),
      ...(externalIds.length ? { externalIds } : {}),
      ...(taggedValues.length ? { taggedValues } : {}),
      meta: {
        bpmnProfileUri: el.namespaceURI,
        bpmnProfileLocalName: ln,
        bpmnProfileTag: el.tagName,
        ...(type === 'Unknown' ? { sourceType: sourceToken } : {}),
      },
    });
  }

  return { elements };
}
