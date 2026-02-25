import type { ModelStoreState } from './modelStore';
import type { DatasetId } from './datasetTypes';

/**
 * Minimal, local-only persistence contract.
 *
 * Step 2 introduces this seam so we can later plug in IndexedDB / remote backends
 * without refactoring UI/store logic. This contract will evolve in later steps.
 */
export type PersistedStoreSlice = Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'>;

export interface DatasetBackend {
  /** Load the persisted store slice (if any) for the given dataset. */
  loadPersistedState(datasetId: DatasetId): Promise<PersistedStoreSlice | null>;

  /** Persist the provided slice. */
  persistState(datasetId: DatasetId, state: PersistedStoreSlice): Promise<void>;

  /** Clear any persisted state for this backend. */
  clearPersistedState(datasetId: DatasetId): Promise<void>;
}
