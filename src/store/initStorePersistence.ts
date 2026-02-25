import { modelStore } from './modelStore';
import { getDefaultDatasetBackend } from './getDefaultDatasetBackend';
import { ensureDatasetRegistryMigrated } from './datasetRegistry';
import { openActiveDatasetOnStartup } from './datasetLifecycle';
import type { DatasetId } from './datasetTypes';
import type { PersistedSlice, StoreFlushEvent } from './storeFlushEvent';
import { emptyChangeSet } from './changeSet';

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

function setPersistenceError(message: string): void {
  modelStore.setPersistenceError(message);
}

function setPersistenceOk(): void {
  modelStore.setPersistenceOk();
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

  // We debounce persistence using a per-dataset pending map so rapid flushes coalesce.
  let pending = false;
  const pendingByDataset = new Map<DatasetId, PersistedSlice>();

  const persistNow = () => {
    if (__persistencePaused) {
      pending = false;
      pendingByDataset.clear();
      return;
    }
    pending = false;

    const entries = Array.from(pendingByDataset.entries());
    pendingByDataset.clear();

    for (const [datasetId, slice] of entries) {
      void backend
        .persistState(datasetId, slice)
        .then(() => setPersistenceOk())
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setPersistenceError(msg);
        });
    }
  };

  const schedulePersist = () => {
    if (__persistencePaused) return;
    if (pending) return;
    pending = true;
    scheduleIdle(persistNow);
  };

  const schedulePersistFromFlush = (evt: StoreFlushEvent) => {
    pendingByDataset.set(evt.datasetId, evt.persisted);
    schedulePersist();
  };
  __schedulePersist = schedulePersist;

  // Persist on store flush events (one per transaction end), debounced.
  modelStore.subscribeFlush(schedulePersistFromFlush);

  // Persist at least once on startup too (captures current state).
  schedulePersistFromFlush({
    datasetId: modelStore.getState().activeDatasetId,
    persisted: {
      model: modelStore.getState().model,
      fileName: modelStore.getState().fileName,
      isDirty: modelStore.getState().isDirty
    },
    changeSet: emptyChangeSet(),
    timestamp: Date.now()
  });
}