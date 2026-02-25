import type { View, ViewFormatting } from '../../../domain';
import type { TaggedValueInput } from '../../mutations';
import { viewMutations } from '../../mutations';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewCrudOps = (deps: ViewOpsDeps) => {
  const { updateModel, recordTouched } = deps;

  const addView = (view: View, folderId?: string): void => {
    updateModel((model) => viewMutations.addView(model, view, folderId));
    recordTouched({ viewUpserts: [view.id], folderUpserts: folderId ? [folderId] : undefined });
  };

  const updateView = (viewId: string, patch: Partial<Omit<View, 'id'>>): void => {
    updateModel((model) => viewMutations.updateView(model, viewId, patch));
    recordTouched({ viewUpserts: [viewId] });
  };

  const upsertViewTaggedValue = (viewId: string, entry: TaggedValueInput): void => {
    updateModel((model) => viewMutations.upsertViewTaggedValue(model, viewId, entry));
    recordTouched({ viewUpserts: [viewId] });
  };

  const removeViewTaggedValue = (viewId: string, taggedValueId: string): void => {
    updateModel((model) => viewMutations.removeViewTaggedValue(model, viewId, taggedValueId));
  };

  const updateViewFormatting = (viewId: string, patch: Partial<ViewFormatting>): void => {
    updateModel((model) => viewMutations.updateViewFormatting(model, viewId, patch));
    recordTouched({ viewUpserts: [viewId] });
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
    recordTouched({ viewDeletes: [viewId] });
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
