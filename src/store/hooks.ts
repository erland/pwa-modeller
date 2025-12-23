import { useSyncExternalStore } from 'react';
import type { ModelStore, ModelStoreState } from './modelStore';
import { modelStore as defaultStore } from './modelStore';

export function useModelStore<T>(
  selector: (state: ModelStoreState) => T,
  store: ModelStore = defaultStore
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}
