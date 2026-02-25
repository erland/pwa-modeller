import type { DatasetBackend, PersistedStoreSlice } from '../../datasetBackend';
import type { DatasetId } from '../../datasetTypes';
import { DEFAULT_LOCAL_DATASET_ID } from '../../datasetTypes';
import { LocalStorageDatasetBackend } from '../../backends/localStorageDatasetBackend';
import { clearPersistedStoreState } from '../../storePersistence';
import { deleteDatasetSlice, getDatasetSlice, putDatasetSlice } from './indexedDb';

/**
 * IndexedDB-backed dataset persistence.
 *
 * Step 4 moves dataset payloads to IndexedDB to make multiple datasets feasible.
 *
 * Migration behavior:
 * - If the requested dataset has no snapshot in IndexedDB and it is the default dataset,
 *   we attempt to read the legacy localStorage snapshot (STORAGE_KEY) once and store it
 *   into IndexedDB. The legacy key is then cleared.
 */
export class IndexedDbBackend implements DatasetBackend {
  private legacy = new LocalStorageDatasetBackend();

  async loadPersistedState(datasetId: DatasetId): Promise<PersistedStoreSlice | null> {
    const existing = await getDatasetSlice(datasetId);
    if (existing) return existing;

    // One-time migration for the legacy single-dataset key.
    if (datasetId === DEFAULT_LOCAL_DATASET_ID) {
      const legacySlice = await this.legacy.loadPersistedState(datasetId);
      if (legacySlice) {
        await putDatasetSlice(datasetId, legacySlice);
        // Stop re-reading legacy key on future loads.
        clearPersistedStoreState();
        return legacySlice;
      }
    }

    return null;
  }

  async persistState(datasetId: DatasetId, state: PersistedStoreSlice): Promise<void> {
    await putDatasetSlice(datasetId, state);
  }

  async clearPersistedState(datasetId: DatasetId): Promise<void> {
    await deleteDatasetSlice(datasetId);
  }
}
