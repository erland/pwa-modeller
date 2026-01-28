import type { ImportReport } from '../../importReport';

import { attr, localName } from '../../framework/xml';
import {
  getBpmnSourceTypeTokenFromEaProfileTagLocalName,
  inferBpmnElementTypeFromEaProfileTagLocalName,
  inferBpmnRelationshipTypeFromEaProfileTagLocalName,
} from '../mapping';
import { buildXmiIdIndex } from '../resolve';
import { getXmiId } from '../xmi';
import {
  EaProfileElementIR,
  ParseEaXmiElementsResult,
  SYNTH_ELEMENT_ID_ATTR,
  buildEaExtensionDocumentationIndex,
  extractDocumentation,
  findOwningPackageFolderId,
  getBaseRefId,
  getEaGuid,
  getStereotype,
  isInsideXmiExtension,
  profileElementIrToElement,
} from './parseElements.common';

function isBpmnProfileNamespace(el: Element): boolean {
  const uri = (el.namespaceURI ?? '').toString().toLowerCase();
  if (!uri) return false;
  // Typical EA BPMN profile URIs look like:
  //  - http://www.sparxsystems.com/profiles/BPMN2.0/1.0
  return uri.includes('sparxsystems.com/profiles/bpmn');
}

function normalizeBpmnProfileElementToIR(args: {
  el: Element;
  ln: string;
  inferredType: string | null;
  sourceToken: string;
  idIndex: Map<string, Element>;
  report: ImportReport;
  eaExtDocsById: Map<string, string>;
  synthId: () => string;
}): EaProfileElementIR {
  const { el, ln, inferredType, sourceToken, idIndex, report, eaExtDocsById, synthId } = args;

  const xmiId = getXmiId(el);
  const baseId = getBaseRefId(el);

  // Prefer base_* reference when present.
  let id = (baseId ?? xmiId)?.trim();
  if (!id) {
    id = synthId();
    try {
      el.setAttribute(SYNTH_ELEMENT_ID_ATTR, id);
    } catch {
      // ignore
    }
    report.warnings.push(
      `EA XMI: BPMN element missing xmi:id; generated synthetic element id "${id}" (profileTag="${el.tagName}", name="${(attr(el, 'name') ?? '').trim()}").`,
    );
  }

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
  const taggedValues = [{ key: 'profileTag', value: el.tagName }, ...(stereotype ? [{ key: 'stereotype', value: stereotype }] : [])];

  const type = inferredType ?? 'Unknown';

  return {
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
  };
}

/**
 * Step 5A (EA XMI BPMN): Parse EA's BPMN profile tags into IR elements.
 */
export function parseEaXmiBpmnProfileElementsToElements(doc: Document, report: ImportReport): ParseEaXmiElementsResult {
  const elements: ReturnType<typeof profileElementIrToElement>[] = [];
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

    const ir = normalizeBpmnProfileElementToIR({
      el,
      ln,
      inferredType: inferred ?? null,
      sourceToken,
      idIndex,
      report,
      eaExtDocsById,
      synthId: () => {
        synthCounter++;
        return `eaBpmnEl_synth_${synthCounter}`;
      },
    });

    if (seen.has(ir.id)) {
      report.warnings.push(`EA XMI: Duplicate BPMN element id "${ir.id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(ir.id);

    elements.push(profileElementIrToElement(ir));
  }

  return { elements };
}
