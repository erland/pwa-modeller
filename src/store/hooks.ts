import { useSyncExternalStore } from 'react';

import { modelStore } from './modelStore';
import type { ModelStoreState } from './modelStore';

export function useModelStore<T>(selector: (state: ModelStoreState) => T): T {
  return useSyncExternalStore(
    (listener) => modelStore.subscribe(listener),
    () => selector(modelStore.getState()),
    () => selector(modelStore.getState())
  );
}
