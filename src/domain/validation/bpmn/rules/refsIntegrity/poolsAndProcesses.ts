import type { Model } from '../../../../types';
import type { ValidationIssue } from '../../../types';
import { getStringAttr, pushMissingOrWrongRef } from './shared';

export function checkPoolProcessRefs(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Participants / Pools -> processRef
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

  return issues;
}
