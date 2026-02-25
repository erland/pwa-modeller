import type { AlignMode, DistributeMode, SameSizeMode } from '../../../domain/layout/types';
import { alignMutations, arrangeMutations } from '../../mutations';
import type { LayoutOpsDeps } from './layoutOpsTypes';

export type LayoutArrangeOps = {
  alignViewElements: (viewId: string, elementIds: string[], mode: AlignMode) => void;
  distributeViewElements: (viewId: string, elementIds: string[], mode: DistributeMode) => void;
  sameSizeViewElements: (viewId: string, elementIds: string[], mode: SameSizeMode) => void;
};

export const createLayoutArrangeOps = (deps: Pick<LayoutOpsDeps, 'updateModel' | 'recordTouched'>): LayoutArrangeOps => {
  const { updateModel, recordTouched } = deps;

  const alignViewElements = (viewId: string, elementIds: string[], mode: AlignMode): void => {
    updateModel((model) => alignMutations.alignViewElements(model, viewId, elementIds, mode));
    recordTouched({ viewUpserts: [viewId], elementUpserts: elementIds });
  };

  const distributeViewElements = (viewId: string, elementIds: string[], mode: DistributeMode): void => {
    updateModel((model) => arrangeMutations.distributeViewElements(model, viewId, elementIds, mode));
    recordTouched({ viewUpserts: [viewId], elementUpserts: elementIds });
  };

  const sameSizeViewElements = (viewId: string, elementIds: string[], mode: SameSizeMode): void => {
    updateModel((model) => arrangeMutations.sameSizeViewElements(model, viewId, elementIds, mode));
    recordTouched({ viewUpserts: [viewId], elementUpserts: elementIds });
  };

  return { alignViewElements, distributeViewElements, sameSizeViewElements };
};
