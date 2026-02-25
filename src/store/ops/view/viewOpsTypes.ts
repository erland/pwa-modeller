import type { Model } from '../../../domain';
import type { TouchedIds } from '../../changeSet';

export type ViewOpsDeps = {
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  recordTouched: (touched: TouchedIds) => void;
};
