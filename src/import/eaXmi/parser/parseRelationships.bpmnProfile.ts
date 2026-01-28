import type { ImportReport } from '../../importReport';
import type { IRRelationship } from '../../framework/ir';

import { attr, localName } from '../../framework/xml';
import { getBpmnSourceTypeTokenFromEaProfileTagLocalName, inferBpmnRelationshipTypeFromEaProfileTagLocalName } from '../mapping';
import { getXmiId } from '../xmi';
import {
  ParseEaXmiRelationshipsResult,
  buildXmiIdIndex,
  extractDocumentation,
  getBaseRefId,
  getEaGuid,
  getStereotype,
  isBpmnProfileNamespace,
  isInsideXmiExtension,
  resolveEndpointId,
} from './parseRelationships.common';

/**
 * Step 5B (EA XMI BPMN): Parse EA's BPMN profile tags into IR relationships.
 */
export function parseEaXmiBpmnProfileRelationships(doc: Document, report: ImportReport): ParseEaXmiRelationshipsResult {
  const relationships: IRRelationship[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const xmiIdIndex = buildXmiIdIndex(doc);

  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    if (isInsideXmiExtension(el)) continue;
    if (!isBpmnProfileNamespace(el)) continue;

    const ln = localName(el);
    const inferred = inferBpmnRelationshipTypeFromEaProfileTagLocalName(ln);
    if (!inferred) continue;

    const sourceToken = getBpmnSourceTypeTokenFromEaProfileTagLocalName(ln) ?? ln;

    const xmiId = getXmiId(el);
    const baseId = getBaseRefId(el);
    let id = (baseId ?? xmiId)?.trim();
    if (!id) {
      synthCounter++;
      id = `eaBpmnRel_synth_${synthCounter}`;
      report.warnings.push(
        `EA XMI: BPMN relationship missing xmi:id; generated synthetic relationship id "${id}" (profileTag="${el.tagName}").`,
      );
    }

    if (seen.has(id)) {
      report.warnings.push(`EA XMI: Duplicate BPMN relationship id "${id}" encountered; skipping subsequent occurrence.`);
      continue;
    }
    seen.add(id);

    // Common attribute names observed: source/target.
    let sourceId = resolveEndpointId(el, ['source', 'client', 'from', 'src', 'start']);
    let targetId = resolveEndpointId(el, ['target', 'supplier', 'to', 'tgt', 'end']);

    // If this is a stereotype application, endpoints may be on the base connector.
    if ((!sourceId || !targetId) && baseId) {
      const base = doc.getElementById(baseId) ?? xmiIdIndex.get(baseId) ?? null;
      if (base) {
        if (!sourceId) sourceId = resolveEndpointId(base, ['source', 'client', 'from', 'src', 'start']);
        if (!targetId) targetId = resolveEndpointId(base, ['target', 'supplier', 'to', 'tgt', 'end']);
      }
    }

    if (!sourceId || !targetId) {
      report.warnings.push(
        `EA XMI: Skipped BPMN relationship "${id}" (${inferred}) because endpoints could not be resolved (source=${sourceId ?? '∅'}, target=${targetId ?? '∅'}).`,
      );
      continue;
    }

    const eaGuid = getEaGuid(el);
    const docText = extractDocumentation(el);
    const name = (attr(el, 'name') ?? '').trim() || undefined;

    const externalIds = [
      ...(xmiId ? [{ system: 'xmi', id: xmiId, kind: 'xmi-id' as const }] : []),
      ...(baseId ? [{ system: 'xmi', id: baseId, kind: 'xmi-base-id' as const }] : []),
      ...(eaGuid ? [{ system: 'sparx-ea', id: eaGuid, kind: 'relationship-guid' as const }] : []),
    ];

    const stereotype = getStereotype(el);
    const taggedValues = [
      { key: 'profileTag', value: el.tagName },
      ...(stereotype ? [{ key: 'stereotype', value: stereotype }] : []),
    ];

    relationships.push({
      id,
      type: inferred ?? 'Unknown',
      sourceId,
      targetId,
      ...(name ? { name } : {}),
      ...(docText ? { documentation: docText } : {}),
      ...(externalIds.length ? { externalIds } : {}),
      ...(taggedValues.length ? { taggedValues } : {}),
      meta: {
        bpmnProfileUri: el.namespaceURI,
        bpmnProfileLocalName: ln,
        bpmnProfileTag: el.tagName,
        ...(inferred ? {} : { sourceType: sourceToken }),
      },
    });
  }

  return { relationships };
}
