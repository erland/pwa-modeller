import {
  ensureDatasetRegistryMigrated,
  persistDatasetRegistry,
  DATASET_REGISTRY_STORAGE_KEY,
} from '../datasetRegistry';
import { getDefaultDatasetBackend } from '../getDefaultDatasetBackend';
import { openDataset } from '../datasetLifecycle';
import { STORAGE_KEY as LEGACY_STORE_STORAGE_KEY, persistStoreState, clearPersistedStoreState } from '../storePersistence';
import { createMockBackend } from './helpers/mockBackend';

function findRegistryEntry(reg: ReturnType<typeof ensureDatasetRegistryMigrated>, datasetId: string) {
  return reg?.entries?.find((e) => e.datasetId === datasetId);
}

/**
 * Invariant-focused smoke tests.
 *
 * Intentionally coarse assertions:
 * - Avoid UI surface and implementation details
 * - Prefer "does not throw" / "creates a usable state" style checks
 */

describe('store invariants (smoke)', () => {
  beforeEach(() => {
    // Clear only the keys we rely on (keeps this suite decoupled from unrelated storage usage).
    window.localStorage.removeItem(DATASET_REGISTRY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORE_STORAGE_KEY);
    clearPersistedStoreState();
  });

  test('dataset registry migrates (or initializes) and ensures a default dataset exists', () => {
    // No registry present
    const reg = ensureDatasetRegistryMigrated();
    expect(reg).toBeTruthy();
    expect(reg!.activeDatasetId).toBeTruthy();

    // Coarse: should contain the active dataset id as an entry
    expect(findRegistryEntry(reg, reg!.activeDatasetId)).toBeTruthy();
  });

  test('dataset registry migration prefers legacy fileName (when present)', () => {
    // Seed persisted store state with a fileName.
    persistStoreState({ model: null, fileName: 'legacy.xmi', isDirty: false });

    const reg = ensureDatasetRegistryMigrated();
    expect(reg).toBeTruthy();

    const active = findRegistryEntry(reg, reg!.activeDatasetId);
    expect(active).toBeTruthy();
    // Coarse: use legacy filename as initial dataset name (or at least include it)
    expect(active!.name).toContain('legacy');
  });

  test('backend kind guard is strict: mismatch between registry storageKind and backend kind throws', async () => {
    const backend = createMockBackend({ kind: 'local' });

    // Registry claims "remote" but backend is "local"
    persistDatasetRegistry({
      v: 1,
      activeDatasetId: 'local:default',
      entries: [
        {
          datasetId: 'local:default',
          fileName: 'Default',
          storageKind: 'remote',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await expect(openDataset('local:default', backend)).rejects.toThrow(/backend kind mismatch/i);
  });

  test('default backend kind is local (and exposes a kind string)', () => {
    const backend = getDefaultDatasetBackend();
    expect(typeof backend.kind).toBe('string');
    expect(backend.kind).toBe('local');
  });
});
