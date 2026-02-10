import type { Model } from '../../domain';
import { elementMutations } from '../mutations';

export type ElementOpsDeps = {
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
};

/**
 * Workflow-level element operations used by UI.
 *
 * These wrap mutations and ensure a stable, intention-revealing API surface.
 */
export const createElementOps = (deps: ElementOpsDeps) => {
  const { updateModel } = deps;

  const moveElementToParent = (childId: string, parentId: string | null): void => {
    updateModel((model) => elementMutations.setElementParent(model, childId, parentId));
  };

  const detachElementToRoot = (childId: string): void => {
    moveElementToParent(childId, null);
  };

  return {
    moveElementToParent,
    detachElementToRoot,
  };
};
