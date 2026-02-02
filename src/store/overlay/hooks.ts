import { useRef, useSyncExternalStore } from 'react';

import type { OverlayStore } from './OverlayStore';
import { overlayStore } from './overlayStoreInstance';

/**
 * React subscription helper for the overlay store.
 *
 * Similar to `useModelStore`, but uses a monotonic store version to keep
 * snapshot results referentially stable between updates.
 *
 * Optional `cacheKey` allows callers to force snapshot recomputation even if the
 * store version hasn't changed (e.g., when a selector depends on component props).
 *
 * NOTE: We intentionally do NOT key the cache by selector identity.
 * Inline arrow functions are common in React components, and keying by identity
 * can cause snapshots to change every render, leading to render loops.
 */
export function useOverlayStore<T>(selector: (store: OverlayStore) => T, cacheKey?: unknown): T {
  const lastVersionRef = useRef<number | null>(null);
  const lastKeyRef = useRef<unknown>(undefined);
  const lastSelectionRef = useRef<T | undefined>(undefined);
  const hasSelectionRef = useRef(false);

  const getSnapshot = (): T => {
    const v = overlayStore.getVersion();
    if (lastVersionRef.current === v && Object.is(lastKeyRef.current, cacheKey) && hasSelectionRef.current) {
      return lastSelectionRef.current as T;
    }

    const next = selector(overlayStore);
    lastVersionRef.current = v;
    lastKeyRef.current = cacheKey;
    lastSelectionRef.current = next;
    hasSelectionRef.current = true;
    return next;
  };

  return useSyncExternalStore((listener) => overlayStore.subscribe(listener), getSnapshot, getSnapshot);
}
