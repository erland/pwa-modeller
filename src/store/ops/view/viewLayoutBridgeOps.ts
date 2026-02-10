import type { ViewNodeLayout } from '../../../domain';
import { layoutMutations } from '../../mutations';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewLayoutBridgeOps = (deps: ViewOpsDeps) => {
  const { updateModel } = deps;

  const updateViewNodeLayout = (
    viewId: string,
    elementId: string,
    patch: Partial<Omit<ViewNodeLayout, 'elementId'>>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodeLayout(model, viewId, elementId, patch));
  };

  const addElementToView = (viewId: string, elementId: string): string => {
    let result = elementId;
    updateModel((model) => {
      result = layoutMutations.addElementToView(model, viewId, elementId);
    });
    return result;
  };

  return {
    updateViewNodeLayout,
    addElementToView,
  };
};
