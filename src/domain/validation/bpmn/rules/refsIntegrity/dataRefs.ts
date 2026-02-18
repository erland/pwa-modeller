import type { Model } from '../../../../types';
import type { ValidationIssue } from '../../../types';
import { getStringAttr, pushMissingOrWrongRef } from './shared';

export function checkDataReferences(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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

  return issues;
}
