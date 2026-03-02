/**
 * Remote dataset API — barrel re-export.
 *
 * This file keeps the public import path stable (`src/store/remoteDatasetApi.ts`)
 * while the implementation is split into smaller modules under `src/store/remoteApi/*`.
 *
 * No behavior changes intended.
 */
export * from './remoteApi/types';

export { listRemoteDatasets, createRemoteDataset, getDatasetHead } from './remoteApi/datasets';
export { acquireOrRefreshLease, getLeaseStatus, releaseLease } from './remoteApi/leases';
export { listSnapshotHistory, restoreSnapshotRevision, getCurrentSnapshot } from './remoteApi/snapshots';
export { appendOperations, getOperationsSince, openDatasetOpsStream } from './remoteApi/ops';
