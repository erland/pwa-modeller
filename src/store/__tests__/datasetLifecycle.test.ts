import type { DatasetBackend, PersistedStoreSlice } from '../datasetBackend';
import { createMockBackend } from './helpers/mockBackend';
import { modelStore } from '../modelStore';
import { DEFAULT_LOCAL_DATASET_ID } from '../datasetTypes';
import type { DatasetId } from '../datasetTypes';
import { createDataset, deleteDataset, openDataset, renameDataset } from '../datasetLifecycle';
import { loadDatasetRegistry } from '../datasetRegistry';
import { createEmptyModel } from '../../domain';

describe('datasetLifecycle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset store state
    modelStore.hydrate({ activeDatasetId: DEFAULT_LOCAL_DATASET_ID, model: null, fileName: null, isDirty: false });
  });

  test('create + open switches between datasets without overwriting', async () => {
    const { backend } = createMockBackend('local');

    // Seed default dataset
    const m1 = createEmptyModel({ name: 'A' });
    await backend.persistState(DEFAULT_LOCAL_DATASET_ID, { model: m1, fileName: 'a.json', isDirty: false });

    await openDataset(DEFAULT_LOCAL_DATASET_ID, backend);
    expect(modelStore.getState().model?.metadata.name).toBe('A');

    const id2 = await createDataset({ name: 'B' }, backend);
    expect(modelStore.getState().activeDatasetId).toBe(id2);
    expect(modelStore.getState().model?.metadata.name).toBe('B');

    // Modify dataset B in backend to simulate independent persistence
    const m2 = createEmptyModel({ name: 'B2' });
    await backend.persistState(id2, { model: m2, fileName: 'b2.json', isDirty: false });

    await openDataset(DEFAULT_LOCAL_DATASET_ID, backend);
    expect(modelStore.getState().activeDatasetId).toBe(DEFAULT_LOCAL_DATASET_ID);
    expect(modelStore.getState().model?.metadata.name).toBe('A');

    await openDataset(id2, backend);
    expect(modelStore.getState().activeDatasetId).toBe(id2);
    expect(modelStore.getState().model?.metadata.name).toBe('B2');
  });

  test('rename updates registry and fileName for active dataset', async () => {
    const { backend } = createMockBackend('local');
    const id = await createDataset({ name: 'Old' }, backend);
    await renameDataset(id, 'New');

    const reg = loadDatasetRegistry();
    expect(reg?.entries.find(e => e.datasetId === id)?.name).toBe('New');
    expect(modelStore.getState().fileName).toBe('New.json');
  });

  test('delete removes from registry and opens fallback active dataset', async () => {
    const { backend } = createMockBackend('local');

    // Seed default
    await backend.persistState(DEFAULT_LOCAL_DATASET_ID, { model: createEmptyModel({ name: 'Default' }), fileName: 'd.json', isDirty: false });
    await openDataset(DEFAULT_LOCAL_DATASET_ID, backend);

    const id2 = await createDataset({ name: 'ToDelete' }, backend);
    expect(modelStore.getState().activeDatasetId).toBe(id2);

    await deleteDataset(id2, backend);
    const reg = loadDatasetRegistry();
    expect(reg?.entries.some(e => e.datasetId === id2)).toBe(false);
    expect(modelStore.getState().activeDatasetId).toBe(reg?.activeDatasetId ?? DEFAULT_LOCAL_DATASET_ID);
  });
});
