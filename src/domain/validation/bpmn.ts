import type { Model } from '../types';
import type { ValidationIssue } from './types';

import { bpmnValidationRules } from './bpmn/rules';

/**
 * BPMN correctness-lite validation (editor-friendly).
 *
 * Implemented as a small rule runner so individual checks stay easy to extend and test.
 */
export function validateBpmnBasics(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of bpmnValidationRules) {
    issues.push(...rule(model));
  }
  return issues;
}
