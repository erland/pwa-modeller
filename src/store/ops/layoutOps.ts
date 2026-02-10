import type { AutoLayoutOptions } from '../../domain/layout/types';
import type { LayoutOpsDeps } from './layout/layoutOpsTypes';
import { createLayoutCrudOps } from './layout/layoutCrudOps';
import { createLayoutArrangeOps } from './layout/layoutArrangeOps';
import { createFitToTextOps } from './layout/fitToTextOps';
import { createAutoLayoutOps } from './layout/autoLayout/autoLayoutOps';

export type { LayoutOpsDeps } from './layout/layoutOpsTypes';

/**
 * Layout operations facade.
 *
 * This file is intentionally small: it composes focused sub-modules (CRUD, arrange, fit-to-text, auto-layout)
 * into the API consumed by the ModelStore.
 */
export const createLayoutOps = (deps: LayoutOpsDeps) => {
  const crud = createLayoutCrudOps({ updateModel: deps.updateModel });
  const arrange = createLayoutArrangeOps({ updateModel: deps.updateModel });
  const fit = createFitToTextOps({ updateModel: deps.updateModel });
  const auto = createAutoLayoutOps({
    getModel: deps.getModel,
    getModelOrThrow: deps.getModelOrThrow,
    updateModel: deps.updateModel,
    autoLayoutCacheByView: deps.autoLayoutCacheByView,
  });

  // Keep the public surface exactly as before.
  return {
    ...crud,
    ...arrange,
    ...fit,
    autoLayoutView: (viewId: string, options: AutoLayoutOptions = {}, selectionNodeIds?: string[]) =>
      auto.autoLayoutView(viewId, options, selectionNodeIds),
  };
};
