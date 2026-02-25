import { DEFAULT_LOCAL_DATASET_ID } from '../datasetTypes';
import { DATASET_REGISTRY_STORAGE_KEY, ensureDatasetRegistryMigrated, loadDatasetRegistry } from '../datasetRegistry';
import { persistStoreState, STORAGE_KEY } from '../storePersistence';
import { createEmptyModel } from '../../domain';

describe('datasetRegistry', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('ensureDatasetRegistryMigrated creates a registry when none exists', () => {
    const reg = ensureDatasetRegistryMigrated();
    expect(reg.v).toBe(1);
    expect(reg.activeDatasetId).toBe(DEFAULT_LOCAL_DATASET_ID);
    expect(reg.entries.length).toBe(1);
    expect(reg.entries[0]?.datasetId).toBe(DEFAULT_LOCAL_DATASET_ID);
    expect(window.localStorage.getItem(DATASET_REGISTRY_STORAGE_KEY)).not.toBeNull();
  });

  test('ensureDatasetRegistryMigrated prefers legacy fileName as dataset name when legacy state exists', () => {
    const model = createEmptyModel({ name: 'Test Model' }, 'model_test');
    persistStoreState({ model, fileName: 'legacy.json', isDirty: false });

    // sanity: legacy key exists
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    const reg = ensureDatasetRegistryMigrated();
    expect(reg.entries[0]?.name).toBe('legacy.json');

    const loaded = loadDatasetRegistry();
    expect(loaded?.entries[0]?.name).toBe('legacy.json');
  });

  test('ensureDatasetRegistryMigrated is idempotent', () => {
    const first = ensureDatasetRegistryMigrated();
    const second = ensureDatasetRegistryMigrated();
    expect(second).toEqual(first);
  });
});
