import type { Model } from '../../../domain';
import type { LayoutOutput } from '../../../domain/layout/types';

export type LayoutOpsDeps = {
  /** Read the latest model snapshot (may be null). */
  getModel: () => Model | null;
  /** Read the latest model snapshot (throws if missing). */
  getModelOrThrow: () => Model;
  /** Commit a model update. */
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  /** Per-view cache for expensive auto-layout computations. */
  autoLayoutCacheByView: Map<string, { signature: string; output: LayoutOutput }>;
};
