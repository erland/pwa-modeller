import type { Model } from '../domain';
import type { UnknownExportPolicy, UnknownExportValidationResult } from '../domain';
import { validateUnknownExportPolicy } from '../domain';

/**
 * Format-agnostic export guard. Exporters can call this before generating output.
 * Not currently wired into UI; intended as a reusable hook point.
 */
export function validateModelForExport(model: Model, unknownPolicy: UnknownExportPolicy = { mode: 'bestEffort' }): UnknownExportValidationResult {
  return validateUnknownExportPolicy(model, unknownPolicy);
}
