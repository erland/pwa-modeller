import { getDatasetRegistryEntry } from '../datasetRegistry';
import { setPendingOps } from '../remoteDatasetSession';
import { snapshotReplaceDtoFromModel } from '../phase3Ops/mapToOperationDto';
import type { ModelStoreState } from '../modelStoreTypes';

/**
 * Phase 3A mapping: when the active dataset is remote, route local edits into the pending-ops pipeline.
 * Kept as a small, isolated helper so ModelStore core update logic stays readable.
 */
export function maybeUpdateRemotePendingSnapshotReplace(state: ModelStoreState): void {
  if (!state.model) return;

  const entry = getDatasetRegistryEntry(state.activeDatasetId);
  // Remote datasets may not have a persisted registry entry (by design).
  // Prefer datasetId prefix, fall back to registry when available.
  const isRemote =
    entry?.storageKind === 'remote' ||
    (typeof state.activeDatasetId === 'string' && state.activeDatasetId.startsWith('remote:'));
  if (!isRemote) return;

  // Keep the pending queue bounded and deterministic.
  setPendingOps(state.activeDatasetId, [snapshotReplaceDtoFromModel(state.model)]);
}
