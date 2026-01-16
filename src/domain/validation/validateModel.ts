import type { Model } from '../types';
import { STRONGEST_RELATIONSHIP_VALIDATION_MODE } from '../relationshipValidationMode';
import type { ValidationIssue } from './types';
import { validateCommonModel } from './validateCommonModel';
import { validateNotationSpecific } from './validateNotationSpecific';

export function validateModel(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...validateCommonModel(model));
  issues.push(...validateNotationSpecific(model, STRONGEST_RELATIONSHIP_VALIDATION_MODE));

  // Keep deterministic ordering for tests/UI.
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
