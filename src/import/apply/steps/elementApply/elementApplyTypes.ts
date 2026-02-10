import type { Element } from '../../../../domain';

export type ElementApplyPlanItem = {
  irId: string;
  element: Element;
  folderId: string;
};

export type ElementApplyPlan = {
  items: ElementApplyPlanItem[];
};
