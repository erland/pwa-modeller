import type { Model } from '../../../domain';

export type ViewOpsDeps = {
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
};
