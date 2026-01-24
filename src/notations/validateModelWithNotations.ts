import type { Model } from '../domain/types';
import type { ValidationIssue } from '../domain/validation/types';
import { validateModelCommon } from '../domain/validation/validateModel';
import { kindsPresent } from '../domain/validation/kindsPresent';
import { getNotationValidator } from './validationRegistry';

/**
 * Validate the model using common (notation-agnostic) rules plus
 * any notation-specific validators for the notations present in the model.
 */
export function validateModelWithNotations(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...validateModelCommon(model));

  for (const kind of kindsPresent(model)) {
    const notation = getNotationValidator(kind);
    issues.push(...notation.validateNotation(model));
  }

  // Keep deterministic ordering for tests/UI.
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
