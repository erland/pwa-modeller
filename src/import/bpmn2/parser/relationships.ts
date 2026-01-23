import type { ParseContext } from './context';

import { attr, childByLocalName, childrenByLocalName, localName, qa, text } from '../xml';
import { bpmnTypeForRelLocalName, extractExtensionSummary } from './helpers';

/**
 * Collect BPMN flows as IR relationships (sequence/message/association).
 */
export function parseRelationships(ctx: ParseContext) {
  const { defs, warnings, relationships, idIndex, relById } = ctx;

  const supportedRelLocalNames = ['sequenceFlow', 'messageFlow', 'association', 'dataInputAssociation', 'dataOutputAssociation'];
  const missingEndpointsWarnings = new Set<string>();

  for (const ln of supportedRelLocalNames) {
    for (const relEl of qa(defs, ln)) {
      const id = (attr(relEl, 'id') ?? '').trim();
      if (!id) {
        warnings.push(`Skipping BPMN relationship without @id (<${localName(relEl)}>)`);
        continue;
      }

      const typeId = bpmnTypeForRelLocalName(localName(relEl));
      if (!typeId) continue;

      // Most BPMN relationships use @sourceRef/@targetRef attributes.
      // Data associations use nested <sourceRef>/<targetRef> elements instead.
      let sourceRef = (attr(relEl, 'sourceRef') ?? '').trim();
      let targetRef = (attr(relEl, 'targetRef') ?? '').trim();

      if (!sourceRef && (typeId === 'bpmn.dataInputAssociation' || typeId === 'bpmn.dataOutputAssociation')) {
        const sourceEls = childrenByLocalName(relEl, 'sourceRef');
        sourceRef = (text(sourceEls[0] ?? null) ?? '').trim();
        const targetEl = childByLocalName(relEl, 'targetRef');
        targetRef = (text(targetEl) ?? '').trim();
      }
      if (!sourceRef || !targetRef) {
        warnings.push(`Skipping ${typeId} (${id}) because sourceRef/targetRef is missing.`);
        continue;
      }

      if (!idIndex.has(sourceRef) || !idIndex.has(targetRef)) {
        const key = `${typeId}:${sourceRef}->${targetRef}`;
        if (!missingEndpointsWarnings.has(key)) {
          missingEndpointsWarnings.add(key);
          warnings.push(
            `Skipping ${typeId} (${id}) because endpoint(s) were not imported (source=${sourceRef}, target=${targetRef}).`
          );
        }
        continue;
      }

      const name = (attr(relEl, 'name') ?? '').trim() || undefined;
      const docEl = childByLocalName(relEl, 'documentation');
      const documentation = text(docEl) || undefined;

      const extTags = extractExtensionSummary(relEl);

      // Lightweight relationship semantics (kept optional / best-effort).
      let relAttrs: Record<string, unknown> | undefined;
      if (typeId === 'bpmn.sequenceFlow') {
        const condEl = childByLocalName(relEl, 'conditionExpression');
        const conditionExpression = text(condEl) || undefined;
        if (conditionExpression) relAttrs = { conditionExpression };
      } else if (typeId === 'bpmn.messageFlow') {
        const messageRef = (attr(relEl, 'messageRef') ?? '').trim() || undefined;
        if (messageRef) relAttrs = { messageRef };
      }

      relationships.push({
        id,
        type: typeId,
        name,
        documentation,
        sourceId: sourceRef,
        targetId: targetRef,
        externalIds: [{ system: 'bpmn2', id, kind: 'relationship' }],
        ...(relAttrs ? { attrs: relAttrs } : {}),
        meta: {
          sourceLocalName: localName(relEl),
          ...(extTags ? { extensionElements: { tags: extTags } } : {})
        }
      });

      relById.set(id, relationships[relationships.length - 1]);
    }
  }
}
