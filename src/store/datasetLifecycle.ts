import type { DatasetBackend } from './datasetBackend';
import { getDefaultDatasetBackend } from './getDefaultDatasetBackend';
import { getRemoteDatasetBackend } from './getRemoteDatasetBackend';
import type { DatasetId } from './datasetTypes';
import { DEFAULT_LOCAL_DATASET_ID } from './datasetTypes';
import type { DatasetSnapshot } from './datasetTypes';
import { createEmptyModel } from '../domain';
import {
  ensureDatasetRegistryMigrated,
  listRegistryDatasets,
  renameDatasetInRegistry,
  removeDatasetEntry,
  setActiveDataset,
  upsertDatasetEntry,
} from './datasetRegistry';
import { modelStore } from './modelStore';
import { acquireOrRefreshLease, getDatasetHead, releaseLease, RemoteDatasetApiError, type LeaseConflictResponse } from './remoteDatasetApi';
import { getLastSeenEtag, getLastWarnedHeadEtag, getLeaseToken, getRemoteRole, setLastWarnedHeadEtag, setLeaseConflict, setLeaseExpiresAt, setLeaseToken } from './remoteDatasetSession';
import { remoteOpsSync } from './phase3Sync';

/**
 * Dataset lifecycle module.
 *
 * Hardening notes for future remote mode:
 * - This module is backend-agnostic: callers may pass a specific backend.
 * - A backend has a `kind` (local/remote). Registry entries may store a `storageKind`.
 *   We prevent mixing local backends with remote dataset references (and vice versa).
 * - The exported functions below use the singleton `modelStore` and default backend,
 *   but `createDatasetLifecycle()` allows dependency injection for future multi-store use.
 */

export type DatasetLifecycleDeps = {
  store: Pick<typeof modelStore, 'hydrate' | 'getState' | 'setFileName'>;
  getBackend: () => DatasetBackend;
};

function createLocalDatasetId(): DatasetId {
  // Stable enough for local datasets; collisions are extremely unlikely.
  const rand = Math.random().toString(36).slice(2);
  return (`local:${Date.now()}:${rand}`) as DatasetId;
}

function assertBackendMatchesRegistry(datasetId: DatasetId, backend: DatasetBackend): void {
  const registry = ensureDatasetRegistryMigrated();
  const entry = registry.entries.find(e => e.datasetId === datasetId);
  const storageKind = entry?.storageKind ?? 'local';
  if (storageKind !== backend.kind) {
    throw new Error(`Dataset backend kind mismatch for ${datasetId}: registry=${storageKind}, backend=${backend.kind}`);
  }
}




/**
 * Phase 2: head polling (Step 7 in docs/phase2-step-by-step-plan-B.md)
 *
 * Polls /datasets/{id}/head to detect remote changes early.
 */
const HEAD_POLL_DEFAULT_MS = 20_000;
const headPollTimers = new Map<DatasetId, ReturnType<typeof setInterval>>();
const headPollInFlight = new Set<DatasetId>();

function stopHeadPollTimer(datasetId: DatasetId): void {
  const t = headPollTimers.get(datasetId);
  if (t) clearInterval(t);
  headPollTimers.delete(datasetId);
  headPollInFlight.delete(datasetId);
}

async function pollHeadOnce(localDatasetId: DatasetId, serverDatasetId: string, deps: DatasetLifecycleDeps): Promise<void> {
  if (headPollInFlight.has(localDatasetId)) return;
  headPollInFlight.add(localDatasetId);
  try {
    const { head } = await getDatasetHead(serverDatasetId);

    // Dataset may have changed since the request started.
    if (deps.store.getState().activeDatasetId !== localDatasetId) return;

    const lastSeen = getLastSeenEtag(localDatasetId);
    const current = head.currentEtag ?? null;
    if (!current || !lastSeen || current === lastSeen) {
      // Lease might have expired server-side; clear token and try to reacquire if allowed.
      if (head.leaseActive === false && getLeaseToken(localDatasetId)) {
        setLeaseToken(localDatasetId, null);
        setLeaseExpiresAt(localDatasetId, null);
        const role = getRemoteRole(localDatasetId);
        if (role && role !== 'VIEWER') {
          await acquireOrRefreshLeaseAndStore(localDatasetId, serverDatasetId);
        }
      }
      return;
    }

    const st = deps.store.getState();
    if (st.isDirty) {
      const lastWarned = getLastWarnedHeadEtag(localDatasetId);
      if (lastWarned !== current) {
        modelStore.setPersistenceRemoteChanged({
          datasetId: localDatasetId,
          message: 'Remote dataset changed while you have local unsaved changes.',
          detectedAt: Date.now(),
          serverEtag: current,
          serverUpdatedBy: head.updatedBy ?? null,
          serverUpdatedAt: head.updatedAt ?? null,
          serverRevision: head.currentRevision ?? null
        });
        setLastWarnedHeadEtag(localDatasetId, current);
      }
      return;
    }

    // Local is clean -> auto-reload in the background.
    const backend = deps.getBackend();
    if (backend.kind !== 'remote') return;
    const restored = await backend.loadPersistedState(localDatasetId);
    // Only hydrate if still active and still clean.
    const after = deps.store.getState();
    if (after.activeDatasetId === localDatasetId && !after.isDirty && restored) {
      deps.store.hydrate({ ...restored, activeDatasetId: localDatasetId });
      modelStore.setPersistenceOk();
      modelStore.clearPersistenceRemoteChanged();
    }
  } catch {
    // Best-effort: ignore transient failures.
  } finally {
    headPollInFlight.delete(localDatasetId);
  }
}

function startHeadPollTimer(localDatasetId: DatasetId, serverDatasetId: string, deps: DatasetLifecycleDeps): void {
  stopHeadPollTimer(localDatasetId);
  const t = setInterval(() => {
    void pollHeadOnce(localDatasetId, serverDatasetId, deps);
  }, HEAD_POLL_DEFAULT_MS);
  headPollTimers.set(localDatasetId, t);
}

/**
 * Phase 2: lease lifecycle (Step 3 in docs/phase2-step-by-step-plan-B.md)
 *
 * We keep lease/session state in the in-memory remoteDatasetSession module.
 * Lease refresh timers are managed here because this module controls dataset open/close.
 */
const LEASE_REFRESH_DEFAULT_MS = 180_000; // default ttl 300s => refresh every 180s

const leaseRefreshTimers = new Map<DatasetId, ReturnType<typeof setInterval>>();
const leaseRefreshInFlight = new Set<DatasetId>();
let beforeUnloadHandlerInstalled = false;

function isRemoteDataset(datasetId: DatasetId): boolean {
  const registry = ensureDatasetRegistryMigrated();
  const entry = registry.entries.find(e => e.datasetId === datasetId);
  return (entry?.storageKind ?? 'local') === 'remote';
}

function getServerDatasetIdForRemote(datasetId: DatasetId): string | null {
  const registry = ensureDatasetRegistryMigrated();
  const entry = registry.entries.find(e => e.datasetId === datasetId);
  if (!entry) return null;
  if ((entry.storageKind ?? 'local') !== 'remote') return null;
  return entry.remote?.serverDatasetId ?? null;
}

function stopLeaseRefreshTimer(datasetId: DatasetId): void {
  const t = leaseRefreshTimers.get(datasetId);
  if (t) clearInterval(t);
  leaseRefreshTimers.delete(datasetId);
  leaseRefreshInFlight.delete(datasetId);
}

async function bestEffortReleaseLease(localDatasetId: DatasetId): Promise<void> {
  if (!isRemoteDataset(localDatasetId)) return;
  const serverDatasetId = getServerDatasetIdForRemote(localDatasetId);
  if (!serverDatasetId) return;

  // Phase 3: stop any active ops sync stream.
  try {
    remoteOpsSync.stop(localDatasetId);
  } catch {
    // ignore
  }

  stopLeaseRefreshTimer(localDatasetId);
  stopHeadPollTimer(localDatasetId);
  setLeaseToken(localDatasetId, null);
  setLeaseExpiresAt(localDatasetId, null);
  setLeaseConflict(localDatasetId, null);
      modelStore.clearPersistenceLeaseConflict();

  try {
    await releaseLease(serverDatasetId);
  } catch {
    // Best effort: ignore network failures on release.
  }
}

async function acquireOrRefreshLeaseAndStore(localDatasetId: DatasetId, serverDatasetId: string): Promise<void> {
  // Avoid overlapping refresh calls.
  if (leaseRefreshInFlight.has(localDatasetId)) return;
  leaseRefreshInFlight.add(localDatasetId);
  try {
    const { lease } = await acquireOrRefreshLease(serverDatasetId);

    if (lease.active && lease.leaseToken) {
      setLeaseToken(localDatasetId, lease.leaseToken);
      setLeaseExpiresAt(localDatasetId, lease.expiresAt);
      setLeaseConflict(localDatasetId, null);
      modelStore.clearPersistenceLeaseConflict();
      return;
    }

    // If server returns active lease but no token, we can't write; treat as read-only.
    setLeaseToken(localDatasetId, null);
    setLeaseExpiresAt(localDatasetId, lease.active ? lease.expiresAt : null);
  } catch (e) {
    // Lease conflict: stop refreshing and remember conflict for Step 6 UI.
    if (e instanceof RemoteDatasetApiError && e.status === 409) {
      const body = e.body as LeaseConflictResponse | undefined;
      setLeaseToken(localDatasetId, null);
      setLeaseExpiresAt(localDatasetId, null);
      setLeaseConflict(localDatasetId, body ?? null);
      modelStore.setPersistenceLeaseConflict({
        datasetId: localDatasetId,
        message: `Remote dataset is locked by another user${body?.holderSub ? ` (${body.holderSub})` : ''}${body?.expiresAt ? ` until ${body.expiresAt}` : ''}.`,
        holderSub: body?.holderSub ?? null,
        expiresAt: body?.expiresAt ?? null,
        myRole: getRemoteRole(localDatasetId) ?? null,
        serverEtag: e.etag ?? null
      });
      stopLeaseRefreshTimer(localDatasetId);
  stopHeadPollTimer(localDatasetId);
      return;
    }
    // Best effort: keep trying on next interval.
    console.warn('Failed to acquire/refresh lease', e);
  } finally {
    leaseRefreshInFlight.delete(localDatasetId);
  }
}

function startLeaseRefreshTimer(localDatasetId: DatasetId, serverDatasetId: string): void {
  stopLeaseRefreshTimer(localDatasetId);
  stopHeadPollTimer(localDatasetId);
  const t = setInterval(() => {
    void acquireOrRefreshLeaseAndStore(localDatasetId, serverDatasetId);
  }, LEASE_REFRESH_DEFAULT_MS);
  leaseRefreshTimers.set(localDatasetId, t);
}

function ensureBeforeUnloadHandlerInstalled(deps: DatasetLifecycleDeps): void {
  if (beforeUnloadHandlerInstalled) return;
  beforeUnloadHandlerInstalled = true;
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeunload', () => {
    try {
      const active = deps.store.getState().activeDatasetId as DatasetId | undefined;
      if (!active) return;
      if (!isRemoteDataset(active)) return;
      // Best-effort: fire and forget
      void bestEffortReleaseLease(active);
    } catch {
      // ignore
    }
  });
}

export function createDatasetLifecycle(deps: DatasetLifecycleDeps) {
  return {
    async listDatasets(): Promise<ReturnType<typeof listRegistryDatasets>> {
      const registry = ensureDatasetRegistryMigrated();
      return listRegistryDatasets(registry);
    },

    /**
     * Opens a dataset into the in-memory store and marks it as active in the registry.
     */
    async openDataset(
      datasetId: DatasetId,
      backend?: DatasetBackend,
      options?: { createIfMissing?: boolean }
    ): Promise<void> {
      const b = backend ?? deps.getBackend();
      assertBackendMatchesRegistry(datasetId, b);

      ensureBeforeUnloadHandlerInstalled(deps);

      const previousActive = deps.store.getState().activeDatasetId as DatasetId;
      if (previousActive && previousActive !== datasetId) {
        await bestEffortReleaseLease(previousActive);
      }


      const restored = await b.loadPersistedState(datasetId);
      if (restored) {
        deps.store.hydrate({ ...restored, activeDatasetId: datasetId });
      } else if (options?.createIfMissing) {
        const empty = createEmptyModel({ name: 'New model' });
        deps.store.hydrate({ activeDatasetId: datasetId, model: empty, fileName: 'model.json', isDirty: false });
        await b.persistState(datasetId, { model: empty, fileName: 'model.json', isDirty: false });
      } else {
        deps.store.hydrate({ activeDatasetId: datasetId, model: null, fileName: null, isDirty: false });
      }

      setActiveDataset(datasetId);

      // Phase 2: lease lifecycle + head polling for remote datasets.
      if (b.kind === 'remote' && isRemoteDataset(datasetId)) {
        const serverDatasetId = getServerDatasetIdForRemote(datasetId);
        const role = getRemoteRole(datasetId);
        if (serverDatasetId) {
          // Start head polling for early remote-change detection (VIEWER+).
          startHeadPollTimer(datasetId, serverDatasetId, deps);

          // Acquire lease + refresh timer only for EDITOR/OWNER.
          if (role && role !== 'VIEWER') {
            await acquireOrRefreshLeaseAndStore(datasetId, serverDatasetId);
            startLeaseRefreshTimer(datasetId, serverDatasetId);
          }

          // Phase 3: operation stream sync (receive + catch-up). Disabled by default.
          remoteOpsSync.start(datasetId, serverDatasetId);
        }
      }
    },

    async createDataset(input: CreateDatasetInput, backend?: DatasetBackend): Promise<DatasetId> {
      const b = backend ?? deps.getBackend();
      const datasetId = createLocalDatasetId();
      const now = Date.now();

      let model = createEmptyModel({ name: input.name });
      let fileName: string | null = `${input.name}.json`;
      let isDirty = false;

      if (input.fromSnapshot) {
        model = input.fromSnapshot.model ?? model;
        fileName = input.fromSnapshot.fileName ?? fileName;
        isDirty = false;
      } else if (input.fromDatasetId) {
        const restored = await b.loadPersistedState(input.fromDatasetId);
        if (restored?.model) {
          model = restored.model;
          fileName = restored.fileName ?? fileName;
          isDirty = false;
        }
      }

      await b.persistState(datasetId, { model, fileName, isDirty });

      upsertDatasetEntry({
        datasetId,
        storageKind: 'local',
        name: input.name,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      });

      await this.openDataset(datasetId, b);
      return datasetId;
    },

    async renameDataset(datasetId: DatasetId, name: string): Promise<void> {
      renameDatasetInRegistry(datasetId, name);

      // If the currently opened dataset is renamed, keep fileName aligned as a default.
      const s = deps.store.getState();
      if (s.activeDatasetId === datasetId) {
        deps.store.setFileName(`${name}.json`);
      }
    },

    async deleteDataset(datasetId: DatasetId, backend?: DatasetBackend): Promise<void> {
      // Pick backend based on registry entry when not explicitly provided.
      // Reason: the default lifecycle uses the local backend, but registry may contain remote entries
      // created by opening a remote dataset. Those should still be removable from the registry.
      const registryBefore = ensureDatasetRegistryMigrated();
      const entry = registryBefore.entries.find(e => e.datasetId === datasetId);
      const storageKind = entry?.storageKind ?? 'local';

      const b = backend ?? (storageKind === 'remote' ? getRemoteDatasetBackend() : deps.getBackend());
      assertBackendMatchesRegistry(datasetId, b);

      await b.clearPersistedState(datasetId);
      const registry = removeDatasetEntry(datasetId);

      // If we deleted the active dataset, open the new active dataset.
      const active = registry.activeDatasetId ?? DEFAULT_LOCAL_DATASET_ID;
      if (deps.store.getState().activeDatasetId !== active) {
        await this.openDataset(active, b);
      }
    },

    // Convenience for startup: ensure registry exists and open its active dataset.
    async openActiveDatasetOnStartup(backend?: DatasetBackend): Promise<void> {
      const registry = ensureDatasetRegistryMigrated();
      await this.openDataset(registry.activeDatasetId, backend, { createIfMissing: false });
    },
  };
}

export type CreateDatasetInput = {
  name: string;
  fromDatasetId?: DatasetId;
  fromSnapshot?: DatasetSnapshot;
};

// Default singleton lifecycle (keeps public API unchanged)

/**
 * Phase 2: allow UI to retry acquiring a lease without re-opening the dataset.
 * Used by Step 6 LeaseConflictDialog.
 */
export async function retryAcquireLeaseForDataset(datasetId: DatasetId): Promise<boolean> {
  if (!isRemoteDataset(datasetId)) return false;
  const serverDatasetId = getServerDatasetIdForRemote(datasetId);
  if (!serverDatasetId) return false;
  const role = getRemoteRole(datasetId);
  if (!role || role === 'VIEWER') return false;

  try {
    await acquireOrRefreshLeaseAndStore(datasetId, serverDatasetId);
    const token = getLeaseToken(datasetId);
    if (token) {
      startLeaseRefreshTimer(datasetId, serverDatasetId);
      modelStore.clearPersistenceLeaseConflict();
      return true;
    }
  } catch {
    // ignore; caller will keep dialog open
  }
  return false;
}

const defaultLifecycle = createDatasetLifecycle({
  store: modelStore,
  getBackend: () => getDefaultDatasetBackend(),
});

export const listDatasets = defaultLifecycle.listDatasets.bind(defaultLifecycle);
export const openDataset = defaultLifecycle.openDataset.bind(defaultLifecycle);
export const createDataset = defaultLifecycle.createDataset.bind(defaultLifecycle);
export const renameDataset = defaultLifecycle.renameDataset.bind(defaultLifecycle);
export const deleteDataset = defaultLifecycle.deleteDataset.bind(defaultLifecycle);
export const openActiveDatasetOnStartup = defaultLifecycle.openActiveDatasetOnStartup.bind(defaultLifecycle);