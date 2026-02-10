import type { ViewNodeLayout, ViewObject, ViewObjectType } from '../../../domain';
import { viewObjectMutations } from '../../mutations';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewObjectsOps = (deps: ViewOpsDeps) => {
  const { updateModel } = deps;

  const addViewObject = (viewId: string, obj: ViewObject, node?: ViewNodeLayout): void => {
    updateModel((model) => viewObjectMutations.addViewObject(model, viewId, obj, node));
  };

  const createViewObjectInViewAt = (viewId: string, type: ViewObjectType, x: number, y: number): string => {
    let created = '';
    updateModel((model) => {
      created = viewObjectMutations.createViewObjectInViewAt(model, viewId, type, x, y);
    });
    return created;
  };

  const updateViewObject = (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void => {
    updateModel((model) => viewObjectMutations.updateViewObject(model, viewId, objectId, patch));
  };

  const deleteViewObject = (viewId: string, objectId: string): void => {
    updateModel((model) => viewObjectMutations.deleteViewObject(model, viewId, objectId));
  };

  return {
    addViewObject,
    createViewObjectInViewAt,
    updateViewObject,
    deleteViewObject,
  };
};
