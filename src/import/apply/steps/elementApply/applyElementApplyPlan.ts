import type { ApplyImportContext } from '../../applyImportTypes';
import { modelStore } from '../../../../store';
import { pushWarning } from '../../applyImportHelpers';
import type { ElementApplyPlan } from './elementApplyTypes';

export function applyElementApplyPlan(ctx: ApplyImportContext, plan: ElementApplyPlan): void {
  for (const item of plan.items) {
    try {
      modelStore.addElement(item.element, item.folderId);
    } catch (e) {
      pushWarning(ctx.report, `Failed to add element "${item.element.name || item.irId}": ${(e as Error).message}`);
    }
  }
}
