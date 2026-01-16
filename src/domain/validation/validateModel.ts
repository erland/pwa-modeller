import type { Model } from '../types';
import { STRONGEST_RELATIONSHIP_VALIDATION_MODE } from '../relationshipValidationMode';
import type { ValidationIssue } from './types';
import { validateCommonModel } from './validateCommonModel';
import { kindsPresent } from './kindsPresent';
import { getNotationValidator } from '../../notations/validationRegistry';

export function validateModel(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...validateCommonModel(model));

  for (const kind of kindsPresent(model)) {
    const notation = getNotationValidator(kind);
    issues.push(
      ...notation.validateNotation({
        model,
        relationshipValidationMode: STRONGEST_RELATIONSHIP_VALIDATION_MODE,
      })
    );
  }

  // Keep deterministic ordering for tests/UI.
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
