import type { Model } from '../types';
import type { ValidationIssue } from './types';
import { validateCommonModel } from './validateCommonModel';

/**
 * Domain-level validation that is notation-agnostic.
 * Notation-specific validators are composed in the notations layer.
 */
export function validateModelCommon(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...validateCommonModel(model));

  // Keep deterministic ordering for tests/UI.
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Backwards-compatible alias (common-only).
 * Prefer notations.validateModelWithNotations(…) when you want notation validation.
 */
export const validateModel = validateModelCommon;
