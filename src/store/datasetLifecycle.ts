import { modelStore } from './modelStore';
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

function createLocalDatasetId(): DatasetId {
  // Stable enough for local datasets; collisions are extremely unlikely.
  const rand = Math.random().toString(36).slice(2);
  return (`local:${Date.now()}:${rand}`) as DatasetId;
}

export async function listDatasets(): Promise<ReturnType<typeof listRegistryDatasets>> {
  const registry = ensureDatasetRegistryMigrated();
  return listRegistryDatasets(registry);
}

/**
 * Opens a dataset into the in-memory store and marks it as active in the registry.
 * If the dataset has no persisted state yet, an empty model will be created and persisted.
 */
export async function openDataset(
  datasetId: DatasetId,
  backend?: DatasetBackend,
  options?: { createIfMissing?: boolean; saveBeforeSwitch?: boolean }
): Promise<void> {
  const b = backend ?? getDefaultDatasetBackend();

    const restored = await b.loadPersistedState(datasetId);
  if (restored) {
    modelStore.hydrate({ ...restored, activeDatasetId: datasetId });
  } else if (options?.createIfMissing) {
    const empty = createEmptyModel({ name: 'New model' });
    modelStore.hydrate({ activeDatasetId: datasetId, model: empty, fileName: 'model.json', isDirty: false });
    await b.persistState(datasetId, { model: empty, fileName: 'model.json', isDirty: false });
  } else {
    modelStore.hydrate({ activeDatasetId: datasetId, model: null, fileName: null, isDirty: false });
  }

  setActiveDataset(datasetId);
}

export type CreateDatasetInput = {
  name: string;
  fromDatasetId?: DatasetId;
  fromSnapshot?: DatasetSnapshot;
};

export async function createDataset(input: CreateDatasetInput, backend?: DatasetBackend): Promise<DatasetId> {
  const b = backend ?? getDefaultDatasetBackend();
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
    name: input.name,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  });

  await openDataset(datasetId, b);
  return datasetId;
}

export async function renameDataset(datasetId: DatasetId, name: string): Promise<void> {
  renameDatasetInRegistry(datasetId, name);

  // If the currently opened dataset is renamed, keep fileName aligned as a default.
  const s = modelStore.getState();
  if (s.activeDatasetId === datasetId) {
    modelStore.setFileName(`${name}.json`);
  }
}

export async function deleteDataset(datasetId: DatasetId, backend?: DatasetBackend): Promise<void> {
  const b = backend ?? getDefaultDatasetBackend();
  await b.clearPersistedState(datasetId);
  const registry = removeDatasetEntry(datasetId);

  // If we deleted the active dataset, open the new active dataset.
  const active = registry.activeDatasetId ?? DEFAULT_LOCAL_DATASET_ID;
  if (modelStore.getState().activeDatasetId !== active) {
    await openDataset(active, b);
  }
}

// Convenience for startup: ensure registry exists and open its active dataset.
export async function openActiveDatasetOnStartup(backend?: DatasetBackend): Promise<void> {
  const registry = ensureDatasetRegistryMigrated();
  await openDataset(registry.activeDatasetId, backend, { createIfMissing: false });
}
