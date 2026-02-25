import type { Model } from '../../domain';
import type { TouchedIds } from '../changeSet';
import { elementMutations } from '../mutations';

export type ElementOpsDeps = {
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  recordTouched: (touched: TouchedIds) => void;
};

/**
 * Workflow-level element operations used by UI.
 *
 * These wrap mutations and ensure a stable, intention-revealing API surface.
 */
export const createElementOps = (deps: ElementOpsDeps) => {
  const { updateModel, recordTouched } = deps;

  const moveElementToParent = (childId: string, parentId: string | null): void => {
    updateModel((model) => elementMutations.setElementParent(model, childId, parentId));
    recordTouched({ elementUpserts: [childId] });
  };

  const detachElementToRoot = (childId: string): void => {
    moveElementToParent(childId, null);
  };

  return {
    moveElementToParent,
    detachElementToRoot,
  };
};
