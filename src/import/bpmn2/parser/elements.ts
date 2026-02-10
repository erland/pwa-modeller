import type { IRElement } from '../../framework/ir';

import { attr, childByLocalName, childrenByLocalName, localName, qa, text } from '../xml';
import { bpmnTypeForNodeLocalName } from '../bpmnTypeForNodeLocalName';

import type { ParseContext } from './context';
import { defaultName, extractExtensionSummary } from './helpers';

/**
 * Collect BPMN node elements as IR elements (best-effort, permissive scan).
 */

function parseLaneAttrs(el: Element, typeId: string): Record<string, unknown> | undefined {
  if (typeId !== 'bpmn.lane') return undefined;

  // Lane membership is expressed via <flowNodeRef>childText</flowNodeRef>.
  // Important: only direct children count.
  const refs: string[] = [];
  for (const ch of childrenByLocalName(el, 'flowNodeRef')) {
    const v = (ch.textContent ?? '').trim();
    if (v) refs.push(v);
  }

  return refs.length ? { flowNodeRefs: refs } : undefined;
}

function parseTextAnnotationAttrs(el: Element, typeId: string): Record<string, unknown> | undefined {
  if (typeId !== 'bpmn.textAnnotation') return undefined;
  const t = text(childByLocalName(el, 'text')) || undefined;
  return t ? { text: t } : undefined;
}

function parseParticipantAttrs(el: Element, typeId: string): Record<string, unknown> | undefined {
  if (typeId !== 'bpmn.pool') return undefined;
  const pr = (attr(el, 'processRef') ?? '').trim();
  return pr ? { processRef: pr } : undefined;
}

function parseProcessAttrs(el: Element, typeId: string): Record<string, unknown> | undefined {
  if (typeId !== 'bpmn.process') return undefined;
  const isExecRaw = (attr(el, 'isExecutable') ?? '').trim();
  const isExecutable = isExecRaw === 'true' ? true : isExecRaw === 'false' ? false : undefined;
  return isExecutable !== undefined ? { isExecutable } : undefined;
}

function parseActivityAttrs(el: Element, typeId: string): Record<string, unknown> | undefined {
  const isActivityType =
    typeId === 'bpmn.task' ||
    typeId === 'bpmn.userTask' ||
    typeId === 'bpmn.serviceTask' ||
    typeId === 'bpmn.scriptTask' ||
    typeId === 'bpmn.manualTask' ||
    typeId === 'bpmn.callActivity' ||
    typeId === 'bpmn.subProcess';
  if (!isActivityType) return undefined;

  // IMPORTANT: use direct children only; do NOT scan descendants.
  // Otherwise markers from child tasks may "leak" onto subProcess containers.
  const standardLoop = childByLocalName(el, 'standardLoopCharacteristics');
  const miLoop = childByLocalName(el, 'multiInstanceLoopCharacteristics');

  let loopType: string | undefined;
  if (standardLoop) {
    loopType = 'standard';
  } else if (miLoop) {
    const isSeq = (attr(miLoop, 'isSequential') ?? '').trim() === 'true';
    loopType = isSeq ? 'multiInstanceSequential' : 'multiInstanceParallel';
  }

  // Compensation semantics
  const isForCompensation = (attr(el, 'isForCompensation') ?? '').trim() === 'true' ? true : undefined;

  // Some tool exports incorrectly put <compensateEventDefinition/> under the activity.
  // Treat it as an opt-in marker, but only if present as a DIRECT child.
  const hasCompDef = !!childByLocalName(el, 'compensateEventDefinition');

  const attrs: Record<string, unknown> = {};
  if (loopType) attrs.loopType = loopType;
  if (typeId === 'bpmn.callActivity') attrs.isCall = true;
  if (isForCompensation || hasCompDef) {
    // Keep loopType explicit when we add other activity semantics; this matches the default factory behaviour.
    if (!attrs.loopType) attrs.loopType = 'none';
    attrs.isForCompensation = true;
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

function detectContainingSubProcessId(el: Element): string | undefined {
  // BPMN nesting is expressed structurally in XML: a <subProcess> may contain flow nodes as descendants.
  // We consider the closest ancestor <subProcess> (excluding the element itself).
  // Note: in some DOM implementations (notably jsdom for XML), `parentElement` may be null.
  // Walk via parentNode and filter to element nodes for robustness.
  let p: Node | null = el.parentNode;
  while (p) {
    if (p.nodeType === Node.ELEMENT_NODE) {
      const pe = p as Element;
      if (localName(pe) === 'subprocess') {
        const pid = (attr(pe, 'id') ?? '').trim();
        return pid || undefined;
      }
    }
    p = p.parentNode;
  }
  return undefined;
}

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

    // Global data definitions (referenced by dataObjectReference/dataStoreReference)
    'dataObject',
    'dataStore',

    // Containers
    'process',
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

      // Semantic containment: flow nodes nested inside a SubProcess.
      // Avoid applying this to top-level structural containers.
      const parentSubProcessId =
        typeId === 'bpmn.process' || typeId === 'bpmn.pool' || typeId === 'bpmn.lane'
          ? undefined
          : detectContainingSubProcessId(el);

      const attrs =
        parseEventAttrs(el, typeId) ??
        parseLaneAttrs(el, typeId) ??
        parseParticipantAttrs(el, typeId) ??
        parseProcessAttrs(el, typeId) ??
        parseTextAnnotationAttrs(el, typeId) ??
        parseActivityAttrs(el, typeId) ??
        (typeId === 'bpmn.dataObjectReference'
          ? {
              dataObjectRef: (attr(el, 'dataObjectRef') ?? '').trim() || undefined
            }
          : typeId === 'bpmn.dataStoreReference'
            ? {
                dataStoreRef: (attr(el, 'dataStoreRef') ?? '').trim() || undefined
              }
            : undefined) ??
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
        ...(parentSubProcessId && parentSubProcessId !== id ? { parentElementId: parentSubProcessId } : {}),
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