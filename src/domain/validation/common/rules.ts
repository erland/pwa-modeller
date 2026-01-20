import type { Model } from '../../types';
import type { ValidationIssue } from '../types';

import { validateCommonSchemaExtensions } from './rules/schemaExtensions';
import { validateCommonIdUniqueness } from './rules/idUniqueness';
import { validateCommonRelationshipConsistency } from './rules/relationshipConsistency';
import { validateCommonFolderStructure } from './rules/folderStructure';
import { validateCommonViewLayoutDuplicates } from './rules/viewLayoutDuplicates';
import { validateCommonViewLayoutNodes } from './rules/viewLayoutNodes';
import { validateCommonViewLayoutRelationships } from './rules/viewLayoutRelationships';

export type CommonValidationRule = (model: Model) => ValidationIssue[];

/**
 * Ordered, stable list of common validation rules.
 * Keep this deterministic to avoid flaky tests / confusing UX.
 */
export const commonValidationRules: CommonValidationRule[] = [
  validateCommonSchemaExtensions,
  validateCommonIdUniqueness,
  validateCommonRelationshipConsistency,
  validateCommonFolderStructure,
  validateCommonViewLayoutDuplicates,
  validateCommonViewLayoutNodes,
  validateCommonViewLayoutRelationships,
];
