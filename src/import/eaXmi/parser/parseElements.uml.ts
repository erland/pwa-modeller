import type { ImportReport } from '../../importReport';

import {
  attr,
  localName,
} from '../../framework/xml';
import {
  inferUmlQualifiedElementTypeFromEaClassifier,
} from '../mapping';
import { buildXmiIdIndex, buildXmiIdToNameIndex } from '../resolve';
import { parseEaXmiClassifierMembers } from '../parseMembers';
import { createTypeNameResolver } from '../typeNameResolver';
import { getXmiId, getXmiType } from '../xmi';
import {
  EaClassifierIR,
  ParseEaXmiElementsResult,
  SYNTH_ELEMENT_ID_ATTR,
  buildEaExtensionDocumentationIndex,
  classifierIrToElement,
  extractDocumentation,
  findOwningPackageFolderId,
  getEaGuid,
  getStereotype,
  isInsideXmiExtension,
  metaClassFromXmiType,
} from './parseElements.common';

function isClassifierCandidate(el: Element): { metaclass: string; xmiType?: string } | null {
  // NOTE: For UML classifier elements we require a real xmi:id.
  // Without xmi:id we cannot create stable references and we risk creating synthetic unnamed classes
  // from metamodel references (for example <type href="…UML.metamodel.uml#Class" xsi:type="uml:Class" />).
  //
  // So: if it's missing xmi:id, it's not a classifier candidate.
  if (!getXmiId(el)) return null;

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

function normalizeClassifierToIR(args: {
  el: Element;
  qualifiedType: string;
  metaclass: string;
  xmiType?: string;
  idIndex: Map<string, Element>;
  report: ImportReport;
  typeNameResolver: ReturnType<typeof createTypeNameResolver>;
  eaExtDocsById: Map<string, string>;
  synthId: () => string;
}): EaClassifierIR {
  const { el, qualifiedType, metaclass, xmiType, idIndex, report, typeNameResolver, eaExtDocsById, synthId } = args;

  let id = getXmiId(el);
  if (!id) {
    id = synthId();
    try {
      el.setAttribute(SYNTH_ELEMENT_ID_ATTR, id);
    } catch {
      // ignore
    }
    report.warnings.push(
      `EA XMI: Element missing xmi:id; generated synthetic element id "${id}" (metaclass="${metaclass}", name="${(attr(el, 'name') ?? '').trim()}").`,
    );
  }

  const nameAttr = (attr(el, 'name') ?? '').trim();
  let name = nameAttr;
  const documentation = extractDocumentation(el, eaExtDocsById);
  if (!name) {
    if (qualifiedType === 'uml.note' && documentation) {
      name = documentation.split(/\r?\n/)[0]!.slice(0, 60).trim() || 'Note';
    } else {
      name = metaclass || 'Element';
    }
  }

  const eaGuid = getEaGuid(el);
  const stereotype = getStereotype(el);
  const folderId = findOwningPackageFolderId(el);

  const members =
    qualifiedType === 'uml.class' || qualifiedType === 'uml.interface' || qualifiedType === 'uml.datatype'
      ? parseEaXmiClassifierMembers(el, idIndex, report, typeNameResolver)
      : undefined;

  const actionKindAttrs =
    qualifiedType === 'uml.action'
      ? (() => {
          const mc = (metaclass ?? '').trim();
          // Only store non-generic kinds; plain "Action" is treated as the default.
          if (!mc || mc === 'Action') return undefined;
          return { actionKind: mc } as Record<string, unknown>;
        })()
      : undefined;

  const externalIds = [
    ...(getXmiId(el) ? [{ system: 'xmi', id: getXmiId(el)!, kind: 'xmi-id' }] : []),
    ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'element-guid' }] : []),
  ];

  const attrs: Record<string, unknown> | undefined = (() => {
    const base: Record<string, unknown> = actionKindAttrs ? { ...actionKindAttrs } : {};
    if (stereotype) base.stereotype = stereotype;
    return Object.keys(base).length ? base : undefined;
  })();

  return {
    id,
    type: qualifiedType,
    name,
    ...(documentation ? { documentation } : {}),
    ...(folderId ? { folderId } : {}),
    ...(externalIds.length ? { externalIds } : {}),
    ...(attrs ? { attrs } : {}),
    meta: {
      ...(xmiType ? { xmiType } : {}),
      metaclass,
      ...(members ? { umlMembers: members } : {}),
    },
  };
}

/**
 * Step 5: Parse UML classifiers into IR elements.
 *
 * Policy notes:
 * - UML Packages are NOT turned into elements in Milestone A (packages are folders).
 */

type Uml2StereotypeApps = {
  stereotypes: Set<string>;
  tags: { key: string; value: string }[];
};

function collectUml2StereotypeApplications(doc: Document): Map<string, Uml2StereotypeApps> {
  const res = new Map<string, Uml2StereotypeApps>();

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    // A UML2 stereotype application typically looks like:
    // <ProfilePrefix:StereotypeName xmi:id="…" base_Class="_…" attr1="…" />
    // We treat any non-core prefixed element with a base_* attribute as a stereotype application.
    const nodeName = el.nodeName || '';
    if (!nodeName.includes(':')) continue;

    const prefix = nodeName.split(':')[0] ?? '';
    if (!prefix || prefix === 'xmi' || prefix === 'uml' || prefix === 'xsi' || prefix === 'ecore') continue;

    const baseId =
      (attr(el, 'base_Class') ?? '').trim() ||
      (attr(el, 'base_Interface') ?? '').trim() ||
      (attr(el, 'base_Enumeration') ?? '').trim() ||
      (attr(el, 'base_DataType') ?? '').trim();

    if (!baseId) continue;

    const stereoName = localName(el);
    const qname = prefix ? `${prefix}::${stereoName}` : stereoName;

    const cur = res.get(baseId) ?? { stereotypes: new Set<string>(), tags: [] };
    cur.stereotypes.add(qname);

    // Convert other attributes into tagged values for inspection/debugging.
    // Exclude infrastructure attrs.
    for (let a = 0; a < el.attributes.length; a++) {
      const at = el.attributes.item(a);
      if (!at) continue;
      const k = at.name;
      if (k === 'xmi:id') continue;
      if (k.startsWith('base_')) continue;
      if (k.startsWith('xmlns:')) continue;
      if (!at.value) continue;
      cur.tags.push({ key: `${qname}.${k}`, value: at.value });
    }

    res.set(baseId, cur);
  }

  // Ensure deterministic tag order.
  for (const v of res.values()) {
    v.tags.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  }

  return res;
}

export function parseEaXmiClassifiersToElements(doc: Document, report: ImportReport): ParseEaXmiElementsResult {
  const elements: ReturnType<typeof classifierIrToElement>[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const idIndex = buildXmiIdIndex(doc);
  const idToName = buildXmiIdToNameIndex(doc, idIndex);
  const typeNameResolver = createTypeNameResolver(idIndex, idToName);
  const eaExtDocsById = buildEaExtensionDocumentationIndex(doc);

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;

    if (isInsideXmiExtension(el)) continue;

    const candidate = isClassifierCandidate(el);
    if (!candidate) continue;

    const qualifiedType = inferUmlQualifiedElementTypeFromEaClassifier({ metaclass: candidate.metaclass });
    if (!qualifiedType) continue;

    const ir = normalizeClassifierToIR({
      el,
      qualifiedType,
      metaclass: candidate.metaclass,
      xmiType: candidate.xmiType,
      idIndex,
      report,
      typeNameResolver,
      eaExtDocsById,
      synthId: () => {
        synthCounter++;
        return `eaEl_synth_${synthCounter}`;
      },
    });

    if (seen.has(ir.id)) {
      report.warnings.push(`EA XMI: Duplicate element id "${ir.id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(ir.id);

    elements.push(classifierIrToElement(ir));
  }


  // Step 5b: Apply UML2 stereotype applications (ProfilePrefix:StereotypeName base_Class="…") onto parsed elements.
  // This is used by java-to-xmi output which emits standard UML2 stereotype application instances.
  const uml2StereoByBaseId = collectUml2StereotypeApplications(doc);
  if (uml2StereoByBaseId.size) {
    const byId = new Map(elements.map((e) => [e.id, e] as const));
    for (const [baseId, app] of uml2StereoByBaseId.entries()) {
      const target = byId.get(baseId);
      if (!target) continue;

      const rawAttrs = (typeof target.attrs === 'object' && target.attrs && !Array.isArray(target.attrs))
        ? (target.attrs as Record<string, unknown>)
        : {};
      const existing = typeof rawAttrs.stereotype === 'string' ? rawAttrs.stereotype : '';
      const nextStereo = Array.from(app.stereotypes.values()).join(', ');

      const merged = existing
        ? `${existing}, ${nextStereo}`
        : nextStereo;

      const nextAttrs: Record<string, unknown> = { ...rawAttrs, stereotype: merged };
      target.attrs = nextAttrs;

      if (app.tags.length) {
        const existingTags = Array.isArray(target.taggedValues) ? target.taggedValues : [];
        target.taggedValues = [...existingTags, ...app.tags];
      }
    }
  }

  return { elements };
}
