import type { DatasetBackend, PersistedStoreSlice } from '../datasetBackend';
import type { DatasetId } from '../datasetTypes';
import { clearPersistedStoreState, loadPersistedStoreState, persistStoreState } from '../storePersistence';

/**
 * Local-only backend implementation.
 *
 * IMPORTANT: This intentionally uses the existing STORAGE_KEY via storePersistence.ts
 * so behavior remains unchanged while we introduce the backend seam.
 */
export class LocalStorageDatasetBackend implements DatasetBackend {
  readonly kind = 'local' as const;

  // LocalStorage is legacy single-dataset persistence.
  // We ignore datasetId for now but keep it in the contract.
  async loadPersistedState(_datasetId: DatasetId): Promise<PersistedStoreSlice | null> {
    return loadPersistedStoreState();
  }

  async persistState(_datasetId: DatasetId, state: PersistedStoreSlice): Promise<void> {
    persistStoreState(state);
  }

  async clearPersistedState(_datasetId: DatasetId): Promise<void> {
    clearPersistedStoreState();
  }
}
