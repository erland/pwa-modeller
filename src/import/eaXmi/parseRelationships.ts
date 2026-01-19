import type { ImportReport } from '../importReport';
import type { IRRelationship } from '../framework/ir';

import { attr, attrAny, childText, localName } from '../framework/xml';
import { inferUmlQualifiedRelationshipTypeFromEaClassifier } from './mapping';
import { parseIdRefList, resolveHrefId } from './resolve';
import { getXmiId, getXmiIdRef, getXmiType } from './xmi';

const EA_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid'] as const;
const STEREOTYPE_ATTRS = ['stereotype', 'stereotypes', 'xmi:stereotype'] as const;

// Written by parseElements.ts when a classifier lacks xmi:id.
const SYNTH_ELEMENT_ID_ATTR = 'data-import-element-id';

function metaClassFromXmiType(xmiType: string | undefined): string | undefined {
  const t = (xmiType ?? '').trim();
  if (!t) return undefined;
  const idx = t.indexOf(':');
  return idx >= 0 ? t.slice(idx + 1).trim() : t;
}

function normalizeMetaClassFromLocalName(ln: string): string | undefined {
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
    default:
      return undefined;
  }
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
      const body = childText(ch, 'body')?.trim();
      if (body) return body;
    }
  }

  const attrDoc = attrAny(el, ['documentation', 'doc', 'notes', 'note'])?.trim();
  if (attrDoc) return attrDoc;

  return undefined;
}

function findOwningClassifierId(el: Element): string | undefined {
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

function resolveRefIds(el: Element, key: string): string[] {
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

function parseEndpointsForMetaclass(el: Element, metaclass: string): { sources: string[]; targets: string[] } {
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
    default:
      return { sources: [], targets: [] };
  }
}

export type ParseEaXmiRelationshipsResult = {
  relationships: IRRelationship[];
};

/**
 * Step 7: Parse relationships (generalization/realization/dependency/include/extend).
 */
export function parseEaXmiRelationships(doc: Document, report: ImportReport): ParseEaXmiRelationshipsResult {
  const relationships: IRRelationship[] = [];
  const seenIds = new Set<string>();
  const seenTriples = new Set<string>();
  let synthCounter = 0;

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    const xmiType = getXmiType(el);
    const metaclass = metaClassFromXmiType(xmiType) ?? normalizeMetaClassFromLocalName(localName(el));
    if (!metaclass) continue;

    // Only handle Step-7 relationship kinds.
    if (
      metaclass !== 'Generalization' &&
      metaclass !== 'Realization' &&
      metaclass !== 'InterfaceRealization' &&
      metaclass !== 'Dependency' &&
      metaclass !== 'Include' &&
      metaclass !== 'Extend'
    ) {
      continue;
    }

    const stereotype = getStereotype(el);
    const stLower = (stereotype ?? '').trim().toLowerCase();

    // EA often exports UML include/extend as a Dependency with a stereotype.
    // Prefer the stereotype semantics when present.
    let qualifiedType = inferUmlQualifiedRelationshipTypeFromEaClassifier({ metaclass, stereotype });
    if (metaclass === 'Dependency') {
      if (stLower === 'include') qualifiedType = 'uml.include';
      else if (stLower === 'extend') qualifiedType = 'uml.extend';
      else if (stLower === 'deployment') qualifiedType = 'uml.deployment';
    }
    if (!qualifiedType) continue;

    let { sources, targets } = parseEndpointsForMetaclass(el, metaclass);

    // Embedded forms often omit "client"/"specific" and rely on the owning classifier.
    if (sources.length === 0) {
      const owner = findOwningClassifierId(el);
      if (owner) sources = [owner];
    }

    // Special-case embedded generalization: <generalization general="…" /> under a classifier.
    if (metaclass === 'Generalization') {
      if (targets.length === 0) targets = resolveRefIds(el, 'general');
    }

    if (!sources.length || !targets.length) {
      report.warnings.push(
        `EA XMI: Skipped relationship (metaclass=${metaclass}) because endpoints could not be resolved (sources=${sources.join(
          ' '
        ) || '∅'}, targets=${targets.join(' ') || '∅'}).`
      );
      continue;
    }

    // Some XMI allows multiple clients/suppliers; we emit one IR relationship per pair.
    const baseId = getXmiId(el) ?? getXmiIdRef(el) ?? undefined;
    const eaGuid = getEaGuid(el);
    const docText = extractDocumentation(el);
    const name = (attr(el, 'name') ?? '').trim() || undefined;

    let pairIdx = 0;
    for (const src of sources) {
      for (const tgt of targets) {
        pairIdx++;
        let id = baseId;

        if (id && (sources.length > 1 || targets.length > 1)) {
          id = `${id}_${pairIdx}`;
        }
        if (!id) {
          synthCounter++;
          id = `eaRel_synth_${synthCounter}`;
        }

        const tripleKey = `${qualifiedType}|${src}|${tgt}`;
        if (seenIds.has(id)) {
          report.warnings.push(`EA XMI: Duplicate relationship id "${id}" encountered; skipping subsequent occurrence.`);
          continue;
        }
        // For synthetic ids, also avoid duplicates by type+endpoints.
        if (!baseId && seenTriples.has(tripleKey)) {
          continue;
        }
        seenIds.add(id);
        seenTriples.add(tripleKey);

        const externalIds = [
          ...(getXmiId(el) ? [{ system: 'xmi', id: getXmiId(el)!, kind: 'xmi-id' }] : []),
          ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'relationship-guid' }] : []),
        ];

        const taggedValues = [...(stereotype ? [{ key: 'stereotype', value: stereotype }] : [])];

        relationships.push({
          id,
          type: qualifiedType,
          sourceId: src,
          targetId: tgt,
          name,
          documentation: docText,
          ...(externalIds.length ? { externalIds } : {}),
          ...(taggedValues.length ? { taggedValues } : {}),
          meta: {
            ...(xmiType ? { xmiType } : {}),
            metaclass,
          },
        });
      }
    }
  }

  return { relationships };
}
