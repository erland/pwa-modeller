import type { DatasetBackend } from './datasetBackend';
import { getDefaultDatasetBackend } from './getDefaultDatasetBackend';
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
import { acquireOrRefreshLease, releaseLease, RemoteDatasetApiError, type LeaseConflictResponse } from './remoteDatasetApi';
import { getRemoteRole, setLeaseConflict, setLeaseExpiresAt, setLeaseToken } from './remoteDatasetSession';

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

  stopLeaseRefreshTimer(localDatasetId);
  setLeaseToken(localDatasetId, null);
  setLeaseExpiresAt(localDatasetId, null);
  setLeaseConflict(localDatasetId, null);

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
      stopLeaseRefreshTimer(localDatasetId);
      return;
    }
    // Best effort: keep trying on next interval.
    // eslint-disable-next-line no-console
    console.warn('Failed to acquire/refresh lease', e);
  } finally {
    leaseRefreshInFlight.delete(localDatasetId);
  }
}

function startLeaseRefreshTimer(localDatasetId: DatasetId, serverDatasetId: string): void {
  stopLeaseRefreshTimer(localDatasetId);
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

      // Phase 2: acquire lease and start refresh timer for remote datasets when role allows editing.
      if (b.kind === 'remote' && isRemoteDataset(datasetId)) {
        const serverDatasetId = getServerDatasetIdForRemote(datasetId);
        const role = getRemoteRole(datasetId);
        if (serverDatasetId && role && role !== 'VIEWER') {
          await acquireOrRefreshLeaseAndStore(datasetId, serverDatasetId);
          // Refresh periodically (best-effort). On conflict we will stop the timer.
          startLeaseRefreshTimer(datasetId, serverDatasetId);
        }
      }

      // Phase 2: acquire lease and start refresh timer for remote datasets when role allows editing.
      if (b.kind === 'remote' && isRemoteDataset(datasetId)) {
        const serverDatasetId = getServerDatasetIdForRemote(datasetId);
        const role = getRemoteRole(datasetId);
        if (serverDatasetId && role && role !== 'VIEWER') {
          await acquireOrRefreshLeaseAndStore(datasetId, serverDatasetId);
          // Only refresh if we actually received a lease token (otherwise we're effectively read-only).
          startLeaseRefreshTimer(datasetId, serverDatasetId);
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
      const b = backend ?? deps.getBackend();
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
