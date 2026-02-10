import type { ApplyImportContext } from '../applyImportTypes';
import { ensureElementIdMappings } from './elementApply/ensureElementIdMappings';
import { buildElementApplyPlan } from './elementApply/buildElementApplyPlan';
import { applyElementApplyPlan } from './elementApply/applyElementApplyPlan';

/**
 * Apply IR elements into the domain model.
 *
 * Refactor note:
 * - We keep this entrypoint small and deterministic.
 * - The heavy lifting is split into: mapping allocation, plan building, and plan application.
 */
export function applyElements(ctx: ApplyImportContext): void {
  // Two-pass mapping: allocate internal ids for all IR elements before creating any domain elements.
  ensureElementIdMappings(ctx);

  const plan = buildElementApplyPlan(ctx);
  applyElementApplyPlan(ctx, plan);
}
