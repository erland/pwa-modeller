import type { ViewNodeLayout } from '../../../domain';
import { layoutMutations } from '../../mutations';
import type { ViewOpsDeps } from './viewOpsTypes';

export const createViewLayoutBridgeOps = (deps: ViewOpsDeps) => {
  const { updateModel, recordTouched } = deps;

  const updateViewNodeLayout = (
    viewId: string,
    elementId: string,
    patch: Partial<Omit<ViewNodeLayout, 'elementId'>>
  ): void => {
    updateModel((model) => layoutMutations.updateViewNodeLayout(model, viewId, elementId, patch));
    recordTouched({ viewUpserts: [viewId] });
  };

  const addElementToView = (viewId: string, elementId: string): string => {
    let result = elementId;
    updateModel((model) => {
      result = layoutMutations.addElementToView(model, viewId, elementId);
    });
    recordTouched({ viewUpserts: [viewId] });
    return result;
  };

  return {
    updateViewNodeLayout,
    addElementToView,
  };
};
