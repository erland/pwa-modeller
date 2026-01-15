import type { Model } from '../types';
import type { RelationshipValidationMode } from '../relationshipValidationMode';
import type { ValidationIssue } from './types';
import { validateCommonModel } from './validateCommonModel';
import { validateNotationSpecific } from './validateNotationSpecific';

export function validateModel(
  model: Model,
  relationshipValidationMode: RelationshipValidationMode = 'minimal'
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...validateCommonModel(model));
  issues.push(...validateNotationSpecific(model, relationshipValidationMode));

  // Keep deterministic ordering for tests/UI.
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
