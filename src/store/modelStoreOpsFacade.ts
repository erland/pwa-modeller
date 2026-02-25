import type { Model } from '../domain';
import type { TouchedIds } from './changeSet';
import { createViewOps } from './ops/viewOps';
import { createLayoutOps } from './ops/layoutOps';
import { createFolderOps } from './ops/folderOps';
import { createElementOps } from './ops/elementOps';
import type { LayoutOutput } from '../domain/layout/types';

export type ModelStoreOpsFacadeDeps = {
  getModel: () => Model | null;
  getModelOrThrow: () => Model;
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  recordTouched: (touched: TouchedIds) => void;
};

export type ModelStoreOpsFacade = {
  viewOps: ReturnType<typeof createViewOps>;
  layoutOps: ReturnType<typeof createLayoutOps>;
  folderOps: ReturnType<typeof createFolderOps>;
  elementOps: ReturnType<typeof createElementOps>;
  autoLayoutCacheByView: Map<string, { signature: string; output: LayoutOutput }>;
};

export function createModelStoreOpsFacade(deps: ModelStoreOpsFacadeDeps): ModelStoreOpsFacade {
  const autoLayoutCacheByView = new Map<string, { signature: string; output: LayoutOutput }>();

  const viewOps = createViewOps({ updateModel: deps.updateModel, recordTouched: deps.recordTouched });
  const layoutOps = createLayoutOps({
    getModel: deps.getModel,
    getModelOrThrow: deps.getModelOrThrow,
    updateModel: deps.updateModel,
    recordTouched: deps.recordTouched,
    autoLayoutCacheByView,
  });
  const folderOps = createFolderOps({ updateModel: deps.updateModel, recordTouched: deps.recordTouched });
  const elementOps = createElementOps({ updateModel: deps.updateModel, recordTouched: deps.recordTouched });

  return { viewOps, layoutOps, folderOps, elementOps, autoLayoutCacheByView };
}
