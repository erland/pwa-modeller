import type { DatasetBackend, DatasetBackendKind, PersistedStoreSlice } from '../../datasetBackend';
import type { DatasetId } from '../../datasetTypes';

/**
 * Shared DatasetBackend mock helper.
 * Keeps backend kind explicit so lifecycle guards remain strict.
 */
export function createMockBackend(kind: DatasetBackendKind = 'local') {
  const storage = new Map<string, PersistedStoreSlice>();

  const backend: DatasetBackend = {
    kind,
    loadPersistedState: async (datasetId: DatasetId) => storage.get(datasetId as unknown as string) ?? null,
    persistState: async (datasetId: DatasetId, state: PersistedStoreSlice) => {
      storage.set(datasetId as unknown as string, state);
    },
    clearPersistedState: async (datasetId: DatasetId) => {
      storage.delete(datasetId as unknown as string);
    },
  };

  return { backend, storage };
}
