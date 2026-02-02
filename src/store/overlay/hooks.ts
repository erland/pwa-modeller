import { useRef, useSyncExternalStore } from 'react';

import type { OverlayStore } from './OverlayStore';
import { overlayStore } from './overlayStoreInstance';

/**
 * React subscription helper for the overlay store.
 *
 * Similar to `useModelStore`, but uses a monotonic store version to keep
 * snapshot results referentially stable between updates.
 */
export function useOverlayStore<T>(selector: (store: OverlayStore) => T): T {
  const lastVersionRef = useRef<number | null>(null);
  const lastSelectionRef = useRef<T | undefined>(undefined);
  const hasSelectionRef = useRef(false);

  const getSnapshot = (): T => {
    const v = overlayStore.getVersion();
    if (lastVersionRef.current === v && hasSelectionRef.current) {
      return lastSelectionRef.current as T;
    }

    const next = selector(overlayStore);
    lastVersionRef.current = v;
    lastSelectionRef.current = next;
    hasSelectionRef.current = true;
    return next;
  };

  return useSyncExternalStore((listener) => overlayStore.subscribe(listener), getSnapshot, getSnapshot);
}
