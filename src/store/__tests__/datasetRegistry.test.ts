import { DEFAULT_LOCAL_DATASET_ID } from '../datasetTypes';
import { DATASET_REGISTRY_STORAGE_KEY, ensureDatasetRegistryMigrated, loadDatasetRegistry, upsertDatasetEntry } from '../datasetRegistry';
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

  test('can persist and reload a remote dataset registry entry', () => {
    ensureDatasetRegistryMigrated();

    upsertDatasetEntry({
      datasetId: 'remote:abc' as any,
      storageKind: 'remote',
      name: 'Remote model',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      remote: {
        baseUrl: 'http://localhost:8081',
        serverDatasetId: '11111111-2222-3333-4444-555555555555',
        displayName: 'Server dataset'
      }
    });

    const loaded = loadDatasetRegistry();
    const e = loaded?.entries.find(x => x.datasetId === ('remote:abc' as any));
    expect(e?.storageKind).toBe('remote');
    expect(e?.remote?.baseUrl).toBe('http://localhost:8081');
    expect(e?.remote?.serverDatasetId).toBe('11111111-2222-3333-4444-555555555555');
    expect(e?.remote?.displayName).toBe('Server dataset');
  });

  test('loadDatasetRegistry returns null for invalid remote entries (missing remote ref)', () => {
    const now = Date.now();
    window.localStorage.setItem(
      DATASET_REGISTRY_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        activeDatasetId: DEFAULT_LOCAL_DATASET_ID,
        entries: [
          {
            datasetId: 'remote:oops',
            storageKind: 'remote',
            name: 'Broken remote',
            createdAt: now,
            updatedAt: now
          }
        ]
      })
    );

    expect(loadDatasetRegistry()).toBeNull();
  });
});
