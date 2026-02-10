import type { View, ViewFormatting } from '../../../domain';
import type { TaggedValueInput } from '../../mutations';
import { viewMutations } from '../../mutations';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewCrudOps = (deps: ViewOpsDeps) => {
  const { updateModel } = deps;

  const addView = (view: View, folderId?: string): void => {
    updateModel((model) => viewMutations.addView(model, view, folderId));
  };

  const updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
    updateModel((model) => viewMutations.updateView(model, viewId, patch));
  };

  const upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => {
    updateModel((model) => viewMutations.upsertViewTaggedValue(model, viewId, entry));
  };

  const removeViewTaggedValue = (viewId: string, taggedValueId: string): void => {
    updateModel((model) => viewMutations.removeViewTaggedValue(model, viewId, taggedValueId));
  };

  const updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => {
    updateModel((model) => viewMutations.updateViewFormatting(model, viewId, patch));
  };

  const cloneView = (viewId: string): string | null => {
    let created: string | null = null;
    updateModel((model) => {
      created = viewMutations.cloneView(model, viewId);
    });
    return created;
  };

  const deleteView = (viewId: string): void => {
    updateModel((model) => viewMutations.deleteView(model, viewId));
  };

  return {
    addView,
    updateView,
    upsertViewTaggedValue,
    removeViewTaggedValue,
    updateViewFormatting,
    cloneView,
    deleteView,
  };
};
