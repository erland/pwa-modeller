import { fitArchiMateBoxToText } from '../../../domain/layout';
import { fitToTextMutations } from '../../mutations';
import type { LayoutOpsDeps } from './layoutOpsTypes';

export type FitToTextOps = {
  fitViewElementsToText: (viewId: string, elementIds: string[]) => void;
};

export const createFitToTextOps = (deps: Pick<LayoutOpsDeps, 'updateModel'>): FitToTextOps => {
  const { updateModel } = deps;

  const fitViewElementsToText = (viewId: string, elementIds: string[]): void => {
    if (elementIds.length === 0) return;

    updateModel((model) => {
      const view = model.views[viewId];
      if (!view || view.kind !== 'archimate' || !view.layout) return;

      const idSet = new Set(elementIds);
      const updates: Array<{ elementId: string; width: number; height: number }> = [];

      for (const n of view.layout.nodes) {
        if (!n.elementId) continue;
        if (!idSet.has(n.elementId)) continue;
        const el = model.elements[n.elementId];
        if (!el) continue;
        const { width, height } = fitArchiMateBoxToText(el, n);
        updates.push({ elementId: n.elementId, width, height });
      }

      if (updates.length === 0) return;
      fitToTextMutations.applyViewElementSizes(model, viewId, updates);
    });
  };

  return { fitViewElementsToText };
};
