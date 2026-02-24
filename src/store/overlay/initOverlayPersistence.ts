import { computeModelSignature } from '../../domain/overlay';
import { modelStore } from '../modelStore';
import { overlayStore } from './overlayStoreInstance';
import { loadPersistedOverlayEntries, persistOverlayEntries } from './persistence';


let __overlayPaused = false;
let __needsReload = false;
let __loadForModel: (() => void) | null = null;
let __schedulePersist: (() => void) | null = null;

export function setOverlayPersistencePaused(paused: boolean): void {
  __overlayPaused = paused;
  if (!paused) {
    if (__needsReload) {
      __needsReload = false;
      __loadForModel?.();
    }
    // Persist once after a paused burst (import) so overlay + store state settles.
    __schedulePersist?.();
  }
}


function isTestEnv(): boolean {
  // Jest sets NODE_ENV=test. Guard to avoid leaking localStorage between tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return g?.process?.env?.NODE_ENV === 'test';
}

function scheduleIdle(fn: () => void): void {
  // requestIdleCallback is nice in the browser but doesn't exist everywhere.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof window !== 'undefined' ? window : undefined;
  if (w?.requestIdleCallback) {
    w.requestIdleCallback(fn, { timeout: 500 });
  } else {
    window.setTimeout(fn, 250);
  }
}

/**
 * Restores overlay entries per computed model signature, and continuously persists changes.
 */
export function initOverlayPersistence(): void {
  if (isTestEnv()) return;

  let currentSignature: string | null = null;
  let pending = false;

  const loadForModel = () => {
    const model = modelStore.getState().model;
    const nextSig = model ? computeModelSignature(model) : null;
    if (nextSig === currentSignature) return;

    currentSignature = nextSig;
    if (!nextSig) {
      overlayStore.clear();
      return;
    }

    const restored = loadPersistedOverlayEntries(nextSig);
    overlayStore.hydrate(restored ?? []);
  };

  __loadForModel = loadForModel;

  const persistNow = () => {
    if (__overlayPaused) {
      pending = false;
      return;
    }
    pending = false;
    if (!currentSignature) return;
    persistOverlayEntries(currentSignature, overlayStore.listEntries());
  };

  const schedulePersist = () => {
    if (__overlayPaused) return;
    if (pending) return;
    pending = true;
    scheduleIdle(persistNow);
  };

  __schedulePersist = schedulePersist;

  // Load overlay initially.
  loadForModel();

  // When the model changes, re-compute signature and reload overlay if needed.
  modelStore.subscribe(() => {
    if (__overlayPaused) {
      __needsReload = true;
      return;
    }
    const before = currentSignature;
    loadForModel();
    if (currentSignature && currentSignature !== before) {
      // Persist after switching so the restored overlay gets stored once too.
      schedulePersist();
    }
  });

  // Persist overlay changes (debounced).
  overlayStore.subscribe(schedulePersist);

  // Persist at least once on startup.
  schedulePersist();
}
