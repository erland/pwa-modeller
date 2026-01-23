import type { IRElement } from '../../framework/ir';

import { attr, childByLocalName, localName, qa, text } from '../xml';
import { bpmnTypeForNodeLocalName } from '../bpmnTypeForNodeLocalName';

import type { ParseContext } from './context';
import { defaultName, extractExtensionSummary } from './helpers';

/**
 * Collect BPMN node elements as IR elements (best-effort, permissive scan).
 */

function parseEventAttrs(el: Element, typeId: string): Record<string, unknown> | undefined {
  // Map internal event types to the domain eventKind values used in attrs.eventDefinition.
  let eventKind: 'start' | 'end' | 'intermediateCatch' | 'intermediateThrow' | 'boundary' | null = null;
  switch (typeId) {
    case 'bpmn.startEvent':
      eventKind = 'start';
      break;
    case 'bpmn.endEvent':
      eventKind = 'end';
      break;
    case 'bpmn.intermediateCatchEvent':
      eventKind = 'intermediateCatch';
      break;
    case 'bpmn.intermediateThrowEvent':
      eventKind = 'intermediateThrow';
      break;
    case 'bpmn.boundaryEvent':
      eventKind = 'boundary';
      break;
    default:
      return undefined;
  }

  // BPMN allows multiple eventDefinitions, but for now we pick the first recognized one.
  const timerDef = qa(el, 'timerEventDefinition')[0];
  if (timerDef) {
    const timeDate = text(childByLocalName(timerDef, 'timeDate')) || undefined;
    const timeDuration = text(childByLocalName(timerDef, 'timeDuration')) || undefined;
    const timeCycle = text(childByLocalName(timerDef, 'timeCycle')) || undefined;

    return {
      eventKind,
      eventDefinition: {
        kind: 'timer',
        ...(timeDate ? { timeDate } : {}),
        ...(timeDuration ? { timeDuration } : {}),
        ...(timeCycle ? { timeCycle } : {})
      },
      ...(eventKind === 'boundary'
        ? {
            // BPMN default is interrupting=true (cancelActivity=true). Keep that explicit.
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const messageDef = qa(el, 'messageEventDefinition')[0];
  if (messageDef) {
    const messageRef = attr(messageDef, 'messageRef') || undefined;
    return {
      eventKind,
      eventDefinition: { kind: 'message', ...(messageRef ? { messageRef } : {}) },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const signalDef = qa(el, 'signalEventDefinition')[0];
  if (signalDef) {
    const signalRef = attr(signalDef, 'signalRef') || undefined;
    return {
      eventKind,
      eventDefinition: { kind: 'signal', ...(signalRef ? { signalRef } : {}) },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const errorDef = qa(el, 'errorEventDefinition')[0];
  if (errorDef) {
    const errorRef = attr(errorDef, 'errorRef') || undefined;
    return {
      eventKind,
      eventDefinition: { kind: 'error', ...(errorRef ? { errorRef } : {}) },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const escalationDef = qa(el, 'escalationEventDefinition')[0];
  if (escalationDef) {
    const escalationRef = attr(escalationDef, 'escalationRef') || undefined;
    return {
      eventKind,
      eventDefinition: { kind: 'escalation', ...(escalationRef ? { escalationRef } : {}) },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const conditionalDef = qa(el, 'conditionalEventDefinition')[0];
  if (conditionalDef) {
    // The expression may be nested; collect the first common child.
    const exprEl = childByLocalName(conditionalDef, 'condition') ?? childByLocalName(conditionalDef, 'conditionExpression');
    const conditionExpression = text(exprEl) || undefined;
    return {
      eventKind,
      eventDefinition: { kind: 'conditional', ...(conditionExpression ? { conditionExpression } : {}) },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const linkDef = qa(el, 'linkEventDefinition')[0];
  if (linkDef) {
    const linkName = (attr(linkDef, 'name') ?? '').trim() || undefined;
    return {
      eventKind,
      eventDefinition: { kind: 'link', ...(linkName ? { linkName } : {}) },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  const terminateDef = qa(el, 'terminateEventDefinition')[0];
  if (terminateDef) {
    return {
      eventKind,
      eventDefinition: { kind: 'terminate' },
      ...(eventKind === 'boundary'
        ? {
            cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
            attachedToRef: attr(el, 'attachedToRef') || undefined
          }
        : {})
    };
  }

  // Default: keep BPMN semantics explicit.
  return {
    eventKind,
    eventDefinition: { kind: 'none' },
    ...(eventKind === 'boundary'
      ? {
          cancelActivity: attr(el, 'cancelActivity') === 'false' ? false : true,
          attachedToRef: attr(el, 'attachedToRef') || undefined
        }
      : {})
  };
}

export function parseElements(ctx: ParseContext) {
  const { defs, warnings, elements, idIndex, elementById, unsupportedNodeTypes } = ctx;

  const supportedNodeLocalNames = [
    // Global definitions (referenced by events / flows)
    'message',
    'signal',
    'error',
    'escalation',

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

      const attrs =
        parseEventAttrs(el, typeId) ??
        (typeId === 'bpmn.error'
          ? {
              errorCode: (attr(el, 'errorCode') ?? '').trim() || undefined,
              structureRef: (attr(el, 'structureRef') ?? '').trim() || undefined
            }
          : typeId === 'bpmn.escalation'
            ? {
                escalationCode: (attr(el, 'escalationCode') ?? '').trim() || undefined
              }
            : typeId === 'bpmn.message'
              ? {
                  itemRef: (attr(el, 'itemRef') ?? '').trim() || undefined
                }
              : undefined);

      elements.push({
        id,
        type: typeId,
        name,
        documentation,
        externalIds: [{ system: 'bpmn2', id, kind: 'element' }],
        ...(attrs ? { attrs } : {}),
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