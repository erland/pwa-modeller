import type { Model } from '../../../../types';
import type { ValidationIssue } from '../../../types';
import { getEventDefinition, pushMissingOrWrongRef } from './shared';

export function checkEventDefinitionRefs(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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

  return issues;
}
