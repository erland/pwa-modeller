import type { Model } from '../../../types';
import { findDuplicateIds, getAllModelIds } from '../../../validation';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Cross-collection ID uniqueness.
 */
export function validateCommonIdUniqueness(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allIds = getAllModelIds(model);
  const duplicates = findDuplicateIds(allIds);
  for (const id of duplicates) {
    issues.push(
      makeIssue('error', `Duplicate id detected in model: ${id}`, { kind: 'model' }, `dupe:${id}`)
    );
  }

  return issues;
}
