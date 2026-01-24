import type { Model } from '../../../types';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';
import { getBooleanAttr, getStringAttr, isBpmnActivityType, isBpmnFlowNodeType, isRecord } from '../shared';

function getEventDefinition(attrs: unknown): Record<string, unknown> | undefined {
  if (!isRecord(attrs)) return undefined;
  const ed = attrs['eventDefinition'];
  return isRecord(ed) ? ed : undefined;
}

function pushMissingOrWrongRef(
  issues: ValidationIssue[],
  args: {
    ownerId: string;
    ownerType: string;
    field: string;
    refId?: string;
    expectedType: string;
    messageMissing: string;
    messageWrongType?: (actualType: string) => string;
    suffix: string;
    targetKind: 'element' | 'relationship';
  },
  model: Model
): void {
  const ref = args.refId;
  if (!ref) {
    issues.push(
      makeIssue(
        'warning',
        args.messageMissing,
        args.targetKind === 'element'
          ? { kind: 'element', elementId: args.ownerId }
          : { kind: 'relationship', relationshipId: args.ownerId },
        args.suffix
      )
    );
    return;
  }

  const el = model.elements[ref];
  if (!el) {
    issues.push(
      makeIssue(
        'warning',
        `${args.ownerType} ${args.ownerId} has ${args.field}=${ref} but that element does not exist.`,
        args.targetKind === 'element'
          ? { kind: 'element', elementId: args.ownerId }
          : { kind: 'relationship', relationshipId: args.ownerId },
        `${args.suffix}:missing:${ref}`
      )
    );
    return;
  }

  if (el.type !== args.expectedType) {
    issues.push(
      makeIssue(
        'warning',
        args.messageWrongType
          ? args.messageWrongType(el.type)
          : `${args.ownerType} ${args.ownerId} has ${args.field}=${ref} but that element is type ${el.type} (expected ${args.expectedType}).`,
        args.targetKind === 'element'
          ? { kind: 'element', elementId: args.ownerId }
          : { kind: 'relationship', relationshipId: args.ownerId },
        `${args.suffix}:wrongType:${ref}`
      )
    );
  }
}

/**
 * Reference integrity checks for BPMN elements/relationships.
 */
export function ruleRefsIntegrity(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Surface importer/apply diagnostics (unresolved external ids that couldn't be rewritten).
  for (const el of Object.values(model.elements)) {
    if (!el.type.startsWith('bpmn.')) continue;
    if (!isRecord(el.attrs)) continue;
    const ur = isRecord(el.attrs) && isRecord(el.attrs['unresolvedRefs']) ? (el.attrs['unresolvedRefs'] as Record<string, unknown>) : undefined;
    if (!isRecord(ur) || !Object.keys(ur).length) continue;
    issues.push(
      makeIssue(
        'warning',
        `BPMN element ${el.id} has unresolved references from import: ${Object.keys(ur).join(', ')}.`,
        { kind: 'element', elementId: el.id },
        `bpmn-unresolved-refs:${el.id}`
      )
    );
  }
  for (const rel of Object.values(model.relationships)) {
    if (!rel.type.startsWith('bpmn.')) continue;
    if (!isRecord(rel.attrs)) continue;
    const ur = isRecord(rel.attrs) && isRecord(rel.attrs['unresolvedRefs']) ? (rel.attrs['unresolvedRefs'] as Record<string, unknown>) : undefined;
    if (!isRecord(ur) || !Object.keys(ur).length) continue;
    issues.push(
      makeIssue(
        'warning',
        `BPMN relationship ${rel.id} has unresolved references from import: ${Object.keys(ur).join(', ')}.`,
        { kind: 'relationship', relationshipId: rel.id },
        `bpmn-unresolved-refs-rel:${rel.id}`
      )
    );
  }

  // --- Participants / Pools -> processRef
  for (const el of Object.values(model.elements)) {
    if (el.type !== 'bpmn.pool') continue;
    const processRefRaw = getStringAttr(el.attrs, 'processRef');
    const processRef = typeof processRefRaw === 'string' ? processRefRaw.trim() : '';
    // processRef is optional in BPMN ("black-box" participants). Only validate if present.
    if (!processRef) continue;
    pushMissingOrWrongRef(
      issues,
      {
        ownerId: el.id,
        ownerType: 'Pool',
        field: 'processRef',
        refId: processRef,
        expectedType: 'bpmn.process',
        messageMissing: '',
        suffix: `bpmn-pool-processRef:${el.id}`,
        targetKind: 'element',
      },
      model
    );
  }

  // --- Lanes -> flowNodeRefs
  const laneMembership: Record<string, string[]> = {};
  for (const el of Object.values(model.elements)) {
    if (el.type !== 'bpmn.lane') continue;
        const flowNodeRefsRaw = isRecord(el.attrs) ? el.attrs['flowNodeRefs'] : undefined;
    const flowNodeRefs = Array.isArray(flowNodeRefsRaw) ? flowNodeRefsRaw : [];
    const ids = flowNodeRefs.filter((v) => typeof v === 'string') as string[];

    for (const id of ids) {
      (laneMembership[id] ||= []).push(el.id);
      const target = model.elements[id];
      if (!target) {
        issues.push(
          makeIssue(
            'warning',
            `Lane ${el.id} references flow node ${id} but that element does not exist.`,
            { kind: 'element', elementId: el.id },
            `bpmn-lane-missing-flownode:${el.id}:${id}`
          )
        );
        continue;
      }
      if (!isBpmnFlowNodeType(target.type)) {
        issues.push(
          makeIssue(
            'warning',
            `Lane ${el.id} should only contain BPMN flow nodes; ${id} is ${target.type}.`,
            { kind: 'element', elementId: el.id },
            `bpmn-lane-nonflownode:${el.id}:${id}`
          )
        );
      }
    }
  }

  // Warn if a flow node is assigned to multiple lanes (common source of confusion).
  for (const [nodeId, lanes] of Object.entries(laneMembership)) {
    if (lanes.length <= 1) continue;
    issues.push(
      makeIssue(
        'warning',
        `Flow node ${nodeId} is contained in multiple lanes (${lanes.join(', ')}).`,
        { kind: 'element', elementId: nodeId },
        `bpmn-multi-lane-membership:${nodeId}`
      )
    );
  }

  // --- Boundary events -> attachedToRef should point to an activity
  for (const el of Object.values(model.elements)) {
    if (el.type !== 'bpmn.boundaryEvent') continue;
    const attachedToRef = getStringAttr(el.attrs, 'attachedToRef');
    if (!attachedToRef) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} is missing attachedToRef (it should be attached to an activity).`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-missing-attachedToRef:${el.id}`
        )
      );
      continue;
    }
    const target = model.elements[attachedToRef];
    if (!target) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} has attachedToRef=${attachedToRef} but that element does not exist.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-attachedToRef-missing:${el.id}:${attachedToRef}`
        )
      );
      continue;
    }
    if (!isBpmnActivityType(target.type)) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} should attach to an activity; ${attachedToRef} is ${target.type}.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-attachedToRef-wrongType:${el.id}:${attachedToRef}`
        )
      );
    }

    // Optional but useful sanity check: cancelActivity should be boolean when present.
    const cancelActivity = getBooleanAttr(el.attrs, 'cancelActivity');
    if (cancelActivity === undefined && isRecord(el.attrs) && el.attrs['cancelActivity'] !== undefined) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} cancelActivity should be a boolean.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-cancelActivity-type:${el.id}`
        )
      );
    }
  }

  // --- Data references
  for (const el of Object.values(model.elements)) {
    if (el.type === 'bpmn.dataObjectReference') {
      const ref = getStringAttr(el.attrs, 'dataObjectRef');
      pushMissingOrWrongRef(
        issues,
        {
          ownerId: el.id,
          ownerType: 'DataObjectReference',
          field: 'dataObjectRef',
          refId: ref,
          expectedType: 'bpmn.dataObject',
          messageMissing: `Data Object Reference ${el.id} is missing dataObjectRef (it should link to a global Data Object).`,
          suffix: `bpmn-dataObjectRef:${el.id}`,
          targetKind: 'element',
        },
        model
      );
    }

    if (el.type === 'bpmn.dataStoreReference') {
      const ref = getStringAttr(el.attrs, 'dataStoreRef');
      pushMissingOrWrongRef(
        issues,
        {
          ownerId: el.id,
          ownerType: 'DataStoreReference',
          field: 'dataStoreRef',
          refId: ref,
          expectedType: 'bpmn.dataStore',
          messageMissing: `Data Store Reference ${el.id} is missing dataStoreRef (it should link to a global Data Store).`,
          suffix: `bpmn-dataStoreRef:${el.id}`,
          targetKind: 'element',
        },
        model
      );
    }
  }

  // --- EventDefinitions -> global element refs
  for (const el of Object.values(model.elements)) {
    if (!el.type.startsWith('bpmn.')) continue;
    const ed = getEventDefinition(el.attrs);
    if (!ed) continue;
    const kind = typeof ed.kind === 'string' ? ed.kind : undefined;
    if (!kind) continue;

    if (kind === 'message') {
      const ref = typeof ed.messageRef === 'string' ? ed.messageRef : undefined;
      pushMissingOrWrongRef(
        issues,
        {
          ownerId: el.id,
          ownerType: 'Event',
          field: 'eventDefinition.messageRef',
          refId: ref,
          expectedType: 'bpmn.message',
          messageMissing: `Event ${el.id} has message eventDefinition but is missing messageRef.`,
          suffix: `bpmn-eventdef-messageRef:${el.id}`,
          targetKind: 'element',
        },
        model
      );
    }

    if (kind === 'signal') {
      const ref = typeof ed.signalRef === 'string' ? ed.signalRef : undefined;
      pushMissingOrWrongRef(
        issues,
        {
          ownerId: el.id,
          ownerType: 'Event',
          field: 'eventDefinition.signalRef',
          refId: ref,
          expectedType: 'bpmn.signal',
          messageMissing: `Event ${el.id} has signal eventDefinition but is missing signalRef.`,
          suffix: `bpmn-eventdef-signalRef:${el.id}`,
          targetKind: 'element',
        },
        model
      );
    }

    if (kind === 'error') {
      const ref = typeof ed.errorRef === 'string' ? ed.errorRef : undefined;
      pushMissingOrWrongRef(
        issues,
        {
          ownerId: el.id,
          ownerType: 'Event',
          field: 'eventDefinition.errorRef',
          refId: ref,
          expectedType: 'bpmn.error',
          messageMissing: `Event ${el.id} has error eventDefinition but is missing errorRef.`,
          suffix: `bpmn-eventdef-errorRef:${el.id}`,
          targetKind: 'element',
        },
        model
      );
    }

    if (kind === 'escalation') {
      const ref = typeof ed.escalationRef === 'string' ? ed.escalationRef : undefined;
      pushMissingOrWrongRef(
        issues,
        {
          ownerId: el.id,
          ownerType: 'Event',
          field: 'eventDefinition.escalationRef',
          refId: ref,
          expectedType: 'bpmn.escalation',
          messageMissing: `Event ${el.id} has escalation eventDefinition but is missing escalationRef.`,
          suffix: `bpmn-eventdef-escalationRef:${el.id}`,
          targetKind: 'element',
        },
        model
      );
    }
  }

  // --- Relationships: messageFlow.messageRef should point to a bpmn.message
  for (const rel of Object.values(model.relationships)) {
    if (rel.type !== 'bpmn.messageFlow') continue;
    const ref = getStringAttr(rel.attrs, 'messageRef');
    if (!ref) continue; // optional in BPMN
    pushMissingOrWrongRef(
      issues,
      {
        ownerId: rel.id,
        ownerType: 'MessageFlow',
        field: 'messageRef',
        refId: ref,
        expectedType: 'bpmn.message',
        messageMissing: `Message Flow ${rel.id} is missing messageRef (optional but recommended).`,
        suffix: `bpmn-messageFlow-messageRef:${rel.id}`,
        targetKind: 'relationship',
      },
      model
    );
  }

  return issues;
}
