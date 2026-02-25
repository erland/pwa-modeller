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
