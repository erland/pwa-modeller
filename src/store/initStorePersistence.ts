import { modelStore } from './modelStore';
import { getDefaultDatasetBackend } from './getDefaultDatasetBackend';
import { ensureDatasetRegistryMigrated, getDatasetRegistryEntry, setActiveDataset } from './datasetRegistry';
import { openDataset } from './datasetLifecycle';
import type { DatasetId } from './datasetTypes';
import { DEFAULT_LOCAL_DATASET_ID } from './datasetTypes';
import type { PersistedSlice, StoreFlushEvent } from './storeFlushEvent';
import { emptyChangeSet } from './changeSet';
import { getRemoteDatasetBackend } from './getRemoteDatasetBackend';
import { getRemoteRole } from './remoteDatasetSession';

let __persistencePaused = false;
let __schedulePersist: (() => void) | null = null;
let __forceNextPersist = false;

export function setStorePersistencePaused(paused: boolean): void {
  __persistencePaused = paused;
}

export function flushStorePersistence(): void {
  __schedulePersist?.();
}

export function flushStorePersistenceForce(): void {
  __forceNextPersist = true;
  __schedulePersist?.();
}


function isJestRuntime(): boolean {
  // Jest sets JEST_WORKER_ID in worker processes. This stays true even if NODE_ENV is overridden in unit tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return Boolean(g?.process?.env?.JEST_WORKER_ID);
}

function isTestEnv(): boolean {
  // Jest sets NODE_ENV=test. Guard to avoid leaking localStorage between tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return g?.process?.env?.NODE_ENV === 'test';
}

function runSoon(fn: () => void): void {
  globalThis.setTimeout(fn, 0);
}

function scheduleIdle(fn: () => void): void {
  // In Jest, requestIdleCallback (if polyfilled) may not be driven by fake timers,
  // so prefer setTimeout to keep persistence scheduling testable/deterministic.
  if (isJestRuntime()) {
    globalThis.setTimeout(fn, 0);
    return;
  }

  // requestIdleCallback is nice in the browser but doesn't exist everywhere.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof window !== 'undefined' ? window : undefined;
  if (w?.requestIdleCallback) {
    w.requestIdleCallback(fn, { timeout: 500 });
  } else {
    globalThis.setTimeout(fn, 250);
  }
}

function setPersistenceError(message: string): void {
  modelStore.setPersistenceError(message);
}

function setPersistenceOk(): void {
  modelStore.setPersistenceOk();
}

function isAuthMissingError(e: unknown): boolean {
  // Remote backend throws RemoteDatasetBackendError with code 'AUTH_MISSING'
  // but we avoid importing the class here to keep init minimal.
  const anyE = e as any;
  const code = anyE?.code;
  const msg = anyE?.message;
  return code === 'AUTH_MISSING' || (typeof msg === 'string' && msg.includes('no access token'));
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
  const registry = ensureDatasetRegistryMigrated();

  // Backend routing: local datasets use IndexedDB/localStorage, remote datasets use the RemoteDatasetBackend.
  const localBackend = getDefaultDatasetBackend();
  const remoteBackend = getRemoteDatasetBackend();

  const backendFor = (datasetId: DatasetId) => {
    const entry = getDatasetRegistryEntry(datasetId);
    const kind = entry?.storageKind ?? 'local';
    return kind === 'remote' ? remoteBackend : localBackend;
  };

  const activeId = registry.activeDatasetId;
  const activeEntry = getDatasetRegistryEntry(activeId);
  const activeKind = activeEntry?.storageKind ?? 'local';

  try {
    await openDataset(activeId, backendFor(activeId), { createIfMissing: false });
  } catch (e) {
    // Avoid black screen on startup when a remote dataset is the last active dataset but the user is not signed in yet.
    if (activeKind === 'remote' && isAuthMissingError(e)) {
      setPersistenceError('Not signed in. Please sign in to open the remote dataset. Falling back to a local dataset.');
      setActiveDataset(DEFAULT_LOCAL_DATASET_ID);
      await openDataset(DEFAULT_LOCAL_DATASET_ID, localBackend, { createIfMissing: true });
    } else {
      // Keep the app usable even if the last dataset cannot be opened.
      setPersistenceError((e as any)?.message ? String((e as any).message) : 'Failed to open last active dataset.');
      setActiveDataset(DEFAULT_LOCAL_DATASET_ID);
      await openDataset(DEFAULT_LOCAL_DATASET_ID, localBackend, { createIfMissing: true });
    }
  }

  // We debounce persistence using a per-dataset pending map so rapid flushes coalesce.
  // For remote datasets we also auto-save (and clear dirty) quickly to reduce "remote changed while dirty" prompts.
  let pending = false;
  let pendingTimer: ReturnType<typeof globalThis.setTimeout> | number | null = null;
  const pendingByDataset = new Map<DatasetId, { slice: PersistedSlice; timestamp: number }>();
  const latestFlushTsByDataset = new Map<DatasetId, number>();
  const cooldownUntilByDataset = new Map<DatasetId, number>();

  const persistNow = () => {
    if (__persistencePaused) {
      pending = false;
      pendingByDataset.clear();
      return;
    }
    pending = false;

    const entries = Array.from(pendingByDataset.entries());
    pendingByDataset.clear();

    for (const [datasetId, entry] of entries) {
      const slice = entry.slice;
      const flushedAt = entry.timestamp;

      const now = Date.now();
      const cooldownUntil = cooldownUntilByDataset.get(datasetId) ?? 0;
      if (now < cooldownUntil) {
        // Re-queue and retry after cooldown (avoid tight retry loops on 409 conflicts).
        pendingByDataset.set(datasetId, entry);
        pending = false;
        if (pendingTimer == null) {
          pendingTimer = globalThis.setTimeout(() => {
            pendingTimer = null;
            persistNow();
          }, cooldownUntil - now);
        }
        continue;
      }

      const backend = backendFor(datasetId);
      const force = __forceNextPersist;
      __forceNextPersist = false;
      const backendAny: any = backend as any;
      const persistPromise = force && typeof backendAny.persistStateWithOptions === 'function'
        ? backendAny.persistStateWithOptions(datasetId, slice, { force: true })
        : backend.persistState(datasetId, slice);
      void persistPromise
        .then(() => {
          setPersistenceOk();
          // If nothing newer has flushed for this dataset, mark it clean after successful auto-save.
          // This is especially important for remote datasets where we treat persistence as "saved".
          const latestTs = latestFlushTsByDataset.get(datasetId) ?? 0;
          const active = modelStore.getState().activeDatasetId;
          const isRemote = getDatasetRegistryEntry(datasetId)?.storageKind === 'remote';
          if (isRemote && active === datasetId && latestTs === flushedAt) {
            const st = modelStore.getState();
            if (st.isDirty) {
              modelStore.markSaved();
            }
          }
        })
        .catch((e: unknown) => {
          // Avoid relying on instanceof across Jest module boundaries; use a structural check instead.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyErr: any = e;



          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          
          if (anyErr && typeof anyErr === 'object' && anyErr.code === 'CONFLICT') {
            // Phase 1: pause auto-persistence and ask the user how to proceed.
            // Use a macrotask so unit tests using fake timers can observe the state change deterministically.
            runSoon(() => {
              setStorePersistencePaused(true);
              modelStore.setPersistenceConflict({
                datasetId,
                message: 'Remote dataset changed on the server. Reload from server or export your local snapshot.',
                serverEtag: anyErr.responseEtag ?? null,
                serverRevision: anyErr.serverRevision ?? null,
                serverUpdatedAt: anyErr.serverUpdatedAt ?? null,
                serverUpdatedBy: anyErr.serverUpdatedBy ?? null,
                serverSavedAt: anyErr.serverSavedAt ?? null,
                serverSavedBy: anyErr.serverSavedBy ?? null
              });
            });
            return;
          }
          if (anyErr && typeof anyErr === 'object' && anyErr.code === 'LEASE_CONFLICT') {
            runSoon(() => {
              setStorePersistencePaused(true);
              const who = anyErr.leaseHolderSub ? ` (${anyErr.leaseHolderSub})` : '';
              const until = anyErr.leaseExpiresAt ? ` until ${anyErr.leaseExpiresAt}` : '';
              modelStore.setPersistenceLeaseConflict({
                datasetId,
                message: `Remote dataset is locked by another user${who}${until}. You can open it read-only or retry acquiring the lease.`,
                holderSub: anyErr.leaseHolderSub ?? null,
                expiresAt: anyErr.leaseExpiresAt ?? null,
                myRole: getRemoteRole(datasetId) ?? null,
                serverEtag: anyErr.responseEtag ?? null
              });
            });
            return;
          }
          if (anyErr && typeof anyErr === 'object' && anyErr.code === 'LEASE_TOKEN_REQUIRED') {
            runSoon(() => {
              setStorePersistencePaused(true);
              const msg = anyErr && typeof anyErr.message === 'string' ? anyErr.message : 'Remote persistence failed.';
              setPersistenceError(msg);
            });
            return;
          }
          if (anyErr && typeof anyErr === 'object' && anyErr.code === 'VALIDATION_FAILED') {
            runSoon(() => {
              setStorePersistencePaused(true);
              const msg = anyErr && typeof anyErr.message === 'string' ? anyErr.message : 'Remote validation failed.';
              // Best-effort error list for Step 5 dialog.
              const errors = Array.isArray(anyErr.validationErrors) ? anyErr.validationErrors : [];
              modelStore.setPersistenceValidationFailure({ datasetId, message: msg, validationErrors: errors });
            });
            return;
          }

          // Phase 3: avoid tight retry loops on 409 (revision/lease conflicts, etc.).
          if (anyErr && typeof anyErr === 'object' && anyErr.status === 409) {
            cooldownUntilByDataset.set(datasetId, Date.now() + 1500);
            setPersistenceError('Remote dataset is out of date (409). Will retry after a short delay.');
            // Re-queue this slice for a later retry.
            pendingByDataset.set(datasetId, { slice, timestamp: Date.now() });
            // Allow scheduling again.
            pending = false;
            schedulePersist();
            return;
          }

          const msg = e instanceof Error ? e.message : String(e);
          setPersistenceError(msg);
        });
    }
  };

  const schedulePersist = () => {
    if (__persistencePaused) return;
    if (pending) return;
    pending = true;
    // Remote datasets should auto-save quickly to keep the store mostly "clean".
    // We still coalesce rapid flushes to avoid overloading the server.
    if (pendingTimer != null) {
      globalThis.clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    const active = modelStore.getState().activeDatasetId;
    const activeKind = getDatasetRegistryEntry(active)?.storageKind ?? 'local';
    if (activeKind === 'remote') {
      pendingTimer = globalThis.setTimeout(() => {
        pendingTimer = null;
        persistNow();
      }, 600);
      return;
    }
    scheduleIdle(persistNow);
  };

  const schedulePersistFromFlush = (evt: StoreFlushEvent) => {
    // Avoid persistence loops: flush events can be emitted for state changes that do not
    // modify the persisted model (e.g. persistence status updates).
    //
    // For *remote* datasets, scheduling persistence when nothing actually changed can cause
    // ops-based feedback loops (apply remote ops -> flush -> persist -> new ops -> …).
    // For *local* datasets, we still persist on startup even if not dirty.
    const cs = evt.changeSet as any;
    const hasChanges = !!cs && (
      !!cs.modelMetadataChanged ||
      (cs.elementUpserts?.length ?? 0) > 0 || (cs.elementDeletes?.length ?? 0) > 0 ||
      (cs.relationshipUpserts?.length ?? 0) > 0 || (cs.relationshipDeletes?.length ?? 0) > 0 ||
      (cs.connectorUpserts?.length ?? 0) > 0 || (cs.connectorDeletes?.length ?? 0) > 0 ||
      (cs.viewUpserts?.length ?? 0) > 0 || (cs.viewDeletes?.length ?? 0) > 0 ||
      (cs.folderUpserts?.length ?? 0) > 0 || (cs.folderDeletes?.length ?? 0) > 0
    );
    const kind = getDatasetRegistryEntry(evt.datasetId)?.storageKind ?? 'local';
    if (kind === 'remote' && !hasChanges && !evt.persisted.isDirty) return;
    latestFlushTsByDataset.set(evt.datasetId, evt.timestamp);
    pendingByDataset.set(evt.datasetId, { slice: evt.persisted, timestamp: evt.timestamp });
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