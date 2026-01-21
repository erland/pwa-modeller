import type { IRElement } from '../../framework/ir';

import { attr, childByLocalName, localName, qa, text } from '../xml';
import { bpmnTypeForNodeLocalName } from '../bpmnTypeForNodeLocalName';

import type { ParseContext } from './context';
import { defaultName, extractExtensionSummary } from './helpers';

/**
 * Collect BPMN node elements as IR elements (best-effort, permissive scan).
 */
export function parseElements(ctx: ParseContext) {
  const { defs, warnings, elements, idIndex, elementById, unsupportedNodeTypes } = ctx;

  const supportedNodeLocalNames = [
    // Containers
    'participant',
    'lane',
    // Activities
    'task',
    'userTask',
    'serviceTask',
    'scriptTask',
    'manualTask',
    'callActivity',
    'subProcess',
    // Events
    'startEvent',
    'endEvent',
    'intermediateCatchEvent',
    'intermediateThrowEvent',
    'boundaryEvent',
    // Gateways
    'exclusiveGateway',
    'parallelGateway',
    'inclusiveGateway',
    'eventBasedGateway',
    // Artifacts
    'textAnnotation',
    'dataObjectReference',
    'dataStoreReference',
    'group'
  ];

  for (const ln of supportedNodeLocalNames) {
    for (const el of qa(defs, ln)) {
      const id = (attr(el, 'id') ?? '').trim();
      if (!id) {
        warnings.push(`Skipping BPMN element without @id (<${localName(el)}>)`);
        continue;
      }

      const typeId = bpmnTypeForNodeLocalName(localName(el));
      if (!typeId) {
        // Shouldn't happen because we only query supported names, but keep defensive.
        const key = localName(el);
        if (!unsupportedNodeTypes.has(key)) {
          unsupportedNodeTypes.add(key);
          warnings.push(`Unsupported BPMN node element <${key}> (skipped)`);
        }
        continue;
      }

      if (idIndex.has(id)) {
        // Avoid duplicates across different traversals.
        continue;
      }
      idIndex.add(id);

      const name = (attr(el, 'name') ?? '').trim() || defaultName(typeId, id);
      const docEl = childByLocalName(el, 'documentation');
      const documentation = text(docEl) || undefined;

      const extTags = extractExtensionSummary(el);

      elements.push({
        id,
        type: typeId,
        name,
        documentation,
        externalIds: [{ system: 'bpmn2', id, kind: 'element' }],
        meta: {
          sourceLocalName: localName(el),
          ...(extTags ? { extensionElements: { tags: extTags } } : {})
        }
      });

      elementById.set(id, elements[elements.length - 1] as IRElement);
    }
  }

  // Warn (once per type) for common BPMN nodes we see but don't yet support.
  const maybeUnsupported = ['sendTask', 'receiveTask', 'businessRuleTask', 'complexGateway', 'transaction', 'eventSubProcess'];
  for (const ln of maybeUnsupported) {
    const found = qa(defs, ln);
    if (!found.length) continue;
    const typeId = bpmnTypeForNodeLocalName(ln.toLowerCase());
    if (!typeId) {
      if (!unsupportedNodeTypes.has(ln)) {
        unsupportedNodeTypes.add(ln);
        warnings.push(`BPMN node type <${ln}> is present but not supported yet (will be skipped).`);
      }
    }
  }
}
