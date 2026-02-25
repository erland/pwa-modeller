import type { PersistedStoreSlice } from '../datasetBackend';
import { DEFAULT_LOCAL_DATASET_ID } from '../datasetTypes';

describe('IndexedDbBackend', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('migrates legacy localStorage payload into IndexedDB once for the default dataset', async () => {
    const inMemory = new Map<string, PersistedStoreSlice>();

    const putDatasetSlice = jest.fn(async (datasetId: string, slice: PersistedStoreSlice) => {
      inMemory.set(datasetId, slice);
    });
    const getDatasetSlice = jest.fn(async (datasetId: string) => inMemory.get(datasetId) ?? null);
    const deleteDatasetSlice = jest.fn(async (datasetId: string) => {
      inMemory.delete(datasetId);
    });

    jest.doMock('../datasets/local/indexedDb', () => ({
      putDatasetSlice,
      getDatasetSlice,
      deleteDatasetSlice
    }));

    const legacySlice: PersistedStoreSlice = { model: { id: 'm1' } as unknown, fileName: 'legacy.json', isDirty: true };
    const legacyLoad = jest.fn(async () => legacySlice);
    jest.doMock('../backends/localStorageDatasetBackend', () => ({
      LocalStorageDatasetBackend: jest.fn().mockImplementation(() => ({
        loadPersistedState: legacyLoad,
        persistState: jest.fn(),
        clearPersistedState: jest.fn()
      }))
    }));

    const clearPersistedStoreState = jest.fn();
    jest.doMock('../storePersistence', () => ({
      clearPersistedStoreState
    }));

    const { IndexedDbBackend } = await import('../datasets/local/IndexedDbBackend');
    const b = new IndexedDbBackend();

    // First load should migrate from legacy.
    const loaded1 = await b.loadPersistedState(DEFAULT_LOCAL_DATASET_ID);
    expect(loaded1).toEqual(legacySlice);
    expect(legacyLoad).toHaveBeenCalledTimes(1);
    expect(putDatasetSlice).toHaveBeenCalledTimes(1);
    expect(putDatasetSlice).toHaveBeenCalledWith(DEFAULT_LOCAL_DATASET_ID, legacySlice);
    expect(clearPersistedStoreState).toHaveBeenCalledTimes(1);

    // Second load should come from IndexedDB and not call legacy again.
    const loaded2 = await b.loadPersistedState(DEFAULT_LOCAL_DATASET_ID);
    expect(loaded2).toEqual(legacySlice);
    expect(legacyLoad).toHaveBeenCalledTimes(1);

    // Clear affects only that dataset.
    await b.clearPersistedState(DEFAULT_LOCAL_DATASET_ID);
    expect(deleteDatasetSlice).toHaveBeenCalledWith(DEFAULT_LOCAL_DATASET_ID);
  });

  test('supports multiple datasets independently', async () => {
    const inMemory = new Map<string, PersistedStoreSlice>();
    jest.doMock('../datasets/local/indexedDb', () => ({
      putDatasetSlice: jest.fn(async (datasetId: string, slice: PersistedStoreSlice) => {
        inMemory.set(datasetId, slice);
      }),
      getDatasetSlice: jest.fn(async (datasetId: string) => inMemory.get(datasetId) ?? null),
      deleteDatasetSlice: jest.fn(async (datasetId: string) => {
        inMemory.delete(datasetId);
      })
    }));

    // Avoid any legacy migration path interfering.
    jest.doMock('../backends/localStorageDatasetBackend', () => ({
      LocalStorageDatasetBackend: jest.fn().mockImplementation(() => ({
        loadPersistedState: jest.fn(async () => null),
        persistState: jest.fn(),
        clearPersistedState: jest.fn()
      }))
    }));
    jest.doMock('../storePersistence', () => ({
      clearPersistedStoreState: jest.fn()
    }));

    const { IndexedDbBackend } = await import('../datasets/local/IndexedDbBackend');
    const b = new IndexedDbBackend();

    const ds1 = DEFAULT_LOCAL_DATASET_ID;
    const ds2 = 'local:second' as unknown as typeof DEFAULT_LOCAL_DATASET_ID;

    const s1: PersistedStoreSlice = { model: { id: 'a' } as unknown, fileName: 'a.json', isDirty: false };
    const s2: PersistedStoreSlice = { model: { id: 'b' } as unknown, fileName: 'b.json', isDirty: true };

    await b.persistState(ds1, s1);
    await b.persistState(ds2, s2);

    expect(await b.loadPersistedState(ds1)).toEqual(s1);
    expect(await b.loadPersistedState(ds2)).toEqual(s2);

    await b.clearPersistedState(ds1);
    expect(await b.loadPersistedState(ds1)).toBeNull();
    expect(await b.loadPersistedState(ds2)).toEqual(s2);
  });
});
