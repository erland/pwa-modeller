import type { ImportReport } from '../importReport';
import type { IRElement } from '../framework/ir';

import { attr, attrAny, childText, localName } from '../framework/xml';
import { inferUmlQualifiedElementTypeFromEaClassifier } from './mapping';
import { buildXmiIdIndex } from './resolve';
import { parseEaXmiClassifierMembers } from './parseMembers';
import { getXmiId, getXmiType } from './xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;

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
  return undefined;
}

function extractDocumentation(el: Element): string | undefined {
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
    const docText = extractDocumentation(el);
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
