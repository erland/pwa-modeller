import { modelStore } from './modelStore';
import { getDefaultDatasetBackend } from './getDefaultDatasetBackend';
import { ensureDatasetRegistryMigrated } from './datasetRegistry';
import { openActiveDatasetOnStartup } from './datasetLifecycle';

let __persistencePaused = false;
let __schedulePersist: (() => void) | null = null;

export function setStorePersistencePaused(paused: boolean): void {
  __persistencePaused = paused;
}

export function flushStorePersistence(): void {
  __schedulePersist?.();
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
 * Restores the last in-memory model from localStorage on refresh, and
 * continuously persists changes.
 */
export function initStorePersistence(): void {
  // IMPORTANT: Step 4 makes persistence async (IndexedDB). Bootstrap awaits this.
  void initStorePersistenceAsync();
}

export async function initStorePersistenceAsync(): Promise<void> {
  if (isTestEnv()) return;

  // Step 3: ensure we have a dataset registry (one-time migration from legacy single-model storage).
  ensureDatasetRegistryMigrated();

  const backend = getDefaultDatasetBackend();

  await openActiveDatasetOnStartup(backend);

  let pending = false;
  const persistNow = () => {
    if (__persistencePaused) {
      pending = false;
      return;
    }
    pending = false;
    const s = modelStore.getState();
    void backend.persistState(s.activeDatasetId, {
      model: s.model,
      fileName: s.fileName,
      isDirty: s.isDirty
    });
  };

  const schedulePersist = () => {
    if (__persistencePaused) return;
    if (pending) return;
    pending = true;
    scheduleIdle(persistNow);
  };

  __schedulePersist = schedulePersist;

  // Persist on any store change (debounced).
  modelStore.subscribe(schedulePersist);

  // Persist at least once on startup too.
  schedulePersist();
}