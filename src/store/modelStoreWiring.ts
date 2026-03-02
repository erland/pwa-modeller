import { DEFAULT_LOCAL_DATASET_ID } from './datasetTypes';
import type { Model } from '../domain';
import type { ModelStoreState } from './modelStoreTypes';
import { ModelStoreCore } from './modelStoreCore';
import { ModelStoreFlush } from './modelStoreFlush';
import { createModelStoreOpsFacade } from './modelStoreOpsFacade';
import { createModelStoreEntityApi } from './modelStoreEntityApi';

export type UpdateModelFn = (mutator: (model: Model) => void, markDirty?: boolean) => void;

export type ModelStoreWiring = {
  flush: ModelStoreFlush;
  core: ModelStoreCore;
  ops: ReturnType<typeof createModelStoreOpsFacade>;
  entityApi: ReturnType<typeof createModelStoreEntityApi>;
};

/**
 * Creates the low-level store wiring (core state + flush + facades).
 *
 * Important: we accept an `updateModel` callback so `ModelStore` can keep
 * the behavioral semantics centralized (mark-dirty + change-set + phase3 hooks),
 * while this module owns only composition/wiring.
 */
export function createModelStoreWiring(deps: { updateModel: UpdateModelFn }): ModelStoreWiring {
  const flush = new ModelStoreFlush();

  const initialState: ModelStoreState = {
    activeDatasetId: DEFAULT_LOCAL_DATASET_ID,
    model: null,
    fileName: null,
    isDirty: false,
    persistenceStatus: { status: 'ok', message: null, lastOkAt: 0, lastErrorAt: null },
    persistenceConflict: null,
    persistenceValidationFailure: null,
    persistenceLeaseConflict: null,
    persistenceRemoteChanged: null,
  };

  const core = new ModelStoreCore(initialState, (state) => flush.onNotify(state));

  const ops = createModelStoreOpsFacade({
    getModel: core.getModel,
    getModelOrThrow: core.getModelOrThrow,
    updateModel: deps.updateModel,
    recordTouched: (touched) => flush.changeSetRecorder.recordTouched(touched),
  });

  const entityApi = createModelStoreEntityApi({
    setState: core.setState,
    updateModel: deps.updateModel,
    changeSetRecorder: flush.changeSetRecorder,
  });

  return { flush, core, ops, entityApi };
}
