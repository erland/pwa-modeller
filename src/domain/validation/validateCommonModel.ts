import type { Model } from '../types';
import type { ValidationIssue } from './types';
import { commonValidationRules } from './common/rules';

/**
 * Common, notation-agnostic model validation.
 *
 * This used to live as one monolithic function. It is now a small orchestrator
 * that runs a stable, ordered set of focused rules.
 */
export function validateCommonModel(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of commonValidationRules) {
    issues.push(...rule(model));
  }

  return issues;
}
