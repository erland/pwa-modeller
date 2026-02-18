import type { Model } from '../../../../types';
import type { ValidationIssue } from '../../../types';
import { getStringAttr, pushMissingOrWrongRef } from './shared';

export function checkMessageFlowRefs(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Relationships: messageFlow.messageRef should point to a bpmn.message
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
