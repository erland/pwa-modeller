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

  const taggedValues = [...(stereotype ? [{ key: 'stereotype', value: stereotype }] : [])];

  return {
    id,
    type: qualifiedType,
    name,
    ...(documentation ? { documentation } : {}),
    ...(folderId ? { folderId } : {}),
    ...(externalIds.length ? { externalIds } : {}),
    ...(taggedValues.length ? { taggedValues } : {}),
    ...(actionKindAttrs ? { attrs: actionKindAttrs } : {}),
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

  return { elements };
}
