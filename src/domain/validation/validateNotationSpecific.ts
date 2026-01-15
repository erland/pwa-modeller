import type { Model } from '../types';
import type { RelationshipValidationMode } from '../relationshipValidationMode';
import type { ValidationIssue } from './types';
import { validateArchimateRelationshipRules } from './archimate';
import { validateUmlBasics } from './uml';

export function validateNotationSpecific(
  model: Model,
  relationshipValidationMode: RelationshipValidationMode
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ArchiMate-specific structural rules
  issues.push(...validateArchimateRelationshipRules(model, relationshipValidationMode));

  // UML-specific validations
  issues.push(...validateUmlBasics(model));

  // BPMN-specific validations can be added here later.

  return issues;
}
