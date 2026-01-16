import type { Model } from '../types';
import type { RelationshipValidationMode } from '../relationshipValidationMode';
import type { ValidationIssue } from './types';
import { validateArchimateRelationshipRules } from './archimate';
import { validateUmlBasics } from './uml';
import { validateBpmnBasics } from './bpmn';
import { kindsPresent } from './kindsPresent';

export function validateNotationSpecific(
  model: Model,
  relationshipValidationMode: RelationshipValidationMode
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const kinds = kindsPresent(model);

  // ArchiMate-specific structural rules
  if (kinds.has('archimate')) {
    issues.push(...validateArchimateRelationshipRules(model, relationshipValidationMode));
  }

  // UML-specific validations
  if (kinds.has('uml')) {
    issues.push(...validateUmlBasics(model));
  }

  // BPMN-specific validations (v1 minimal)
  if (kinds.has('bpmn')) {
    issues.push(...validateBpmnBasics(model));
  }

  return issues;
}
