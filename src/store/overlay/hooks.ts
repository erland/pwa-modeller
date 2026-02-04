import { useRef, useSyncExternalStore } from 'react';

import type { Model } from '../../domain/types';
import { computeModelSignature } from '../../domain/overlay/modelSignature';

import type { OverlayStore } from './OverlayStore';
import { overlayStore } from './overlayStoreInstance';
import { buildOverlayAttachmentIndex, type OverlayAttachmentIndex } from './indexing';

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

/**
 * Build a fast overlay lookup index for the provided model.
 *
 * Recomputes when either the model signature or overlay store version changes.
 */
export function useOverlayAttachmentIndex(model: Model | undefined): OverlayAttachmentIndex | undefined {
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  const lastSigRef = useRef<string | null>(null);
  const lastVerRef = useRef<number | null>(null);
  const lastIndexRef = useRef<OverlayAttachmentIndex | undefined>(undefined);

  const sig = model ? computeModelSignature(model) : '';

  if (!model) {
    lastSigRef.current = null;
    lastVerRef.current = null;
    lastIndexRef.current = undefined;
    return undefined;
  }

  if (lastSigRef.current === sig && lastVerRef.current === overlayVersion && lastIndexRef.current) {
    return lastIndexRef.current;
  }

  const next = buildOverlayAttachmentIndex(model, overlayStore);
  lastSigRef.current = sig;
  lastVerRef.current = overlayVersion;
  lastIndexRef.current = next;
  return next;
}
