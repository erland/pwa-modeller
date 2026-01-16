import { modelStore } from './modelStore';
import { loadPersistedStoreState, persistStoreState } from './storePersistence';

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
 * Restores the last in-memory model from localStorage on refresh, and
 * continuously persists changes.
 */
export function initStorePersistence(): void {
  if (isTestEnv()) return;

  const restored = loadPersistedStoreState();
  if (restored) {
    modelStore.hydrate(restored);
  }

  let pending = false;
  const persistNow = () => {
    pending = false;
    const s = modelStore.getState();
    persistStoreState({
      model: s.model,
      fileName: s.fileName,
      isDirty: s.isDirty
    });
  };

  const schedulePersist = () => {
    if (pending) return;
    pending = true;
    scheduleIdle(persistNow);
  };

  // Persist on any store change (debounced).
  modelStore.subscribe(schedulePersist);

  // Persist at least once on startup too.
  schedulePersist();
}
