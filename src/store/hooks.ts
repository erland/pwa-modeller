import { useRef, useSyncExternalStore } from 'react';

import { modelStore } from './modelStore';
import type { ModelStoreState } from './modelStore';

/**
 * Wrapper around useSyncExternalStore that ensures the snapshot is referentially
 * stable for a given store state instance.
 *
 * This matters if callers use selectors that allocate new objects/arrays; React
 * expects getSnapshot() to return a cached value if the underlying store state
 * has not changed.
 */
export function useModelStore<T>(selector: (state: ModelStoreState) => T): T {
  const lastStateRef = useRef<ModelStoreState | null>(null);
  const lastSelectionRef = useRef<T | undefined>(undefined);
  const hasSelectionRef = useRef(false);

  const getSnapshot = (): T => {
    const state = modelStore.getState();

    if (lastStateRef.current === state && hasSelectionRef.current) {
      // Safe because we only return when we have cached a selection already.
      return lastSelectionRef.current as T;
    }

    const next = selector(state);
    lastStateRef.current = state;
    lastSelectionRef.current = next;
    hasSelectionRef.current = true;
    return next;
  };

  return useSyncExternalStore(
    (listener) => modelStore.subscribe(listener),
    getSnapshot,
    getSnapshot
  );
}
