import type { DatasetId } from './datasetTypes';
import type { Role } from './remoteDatasetApi';

/**
 * In-memory per-dataset remote session state.
 *
 * Phase 2 needs the client to remember per dataset:
 *  - lastSeenEtag: optimistic concurrency token for snapshot writes
 *  - leaseToken:   server-issued token required for protected writes
 *  - role:         viewer/editor/owner
 *
 * This is intentionally NOT persisted to localStorage:
 *  - lease tokens are short lived and should be re-acquired
 *  - role may change server-side
 *  - etag is safe to keep in memory and will be refreshed on load
 */

export type RemoteDatasetSession = {
  datasetId: DatasetId;
  lastSeenEtag: string | null;
  leaseToken: string | null;
  role: Role | null;
};

const sessionsByDatasetId = new Map<DatasetId, RemoteDatasetSession>();

function ensureSession(datasetId: DatasetId): RemoteDatasetSession {
  const existing = sessionsByDatasetId.get(datasetId);
  if (existing) return existing;
  const created: RemoteDatasetSession = {
    datasetId,
    lastSeenEtag: null,
    leaseToken: null,
    role: null
  };
  sessionsByDatasetId.set(datasetId, created);
  return created;
}

export function getRemoteDatasetSession(datasetId: DatasetId): RemoteDatasetSession {
  return ensureSession(datasetId);
}

export function patchRemoteDatasetSession(
  datasetId: DatasetId,
  patch: Partial<Omit<RemoteDatasetSession, 'datasetId'>>
): RemoteDatasetSession {
  const s = ensureSession(datasetId);
  const next: RemoteDatasetSession = {
    ...s,
    ...patch,
    datasetId
  };
  sessionsByDatasetId.set(datasetId, next);
  return next;
}

export function clearRemoteDatasetSession(datasetId: DatasetId): void {
  sessionsByDatasetId.delete(datasetId);
}

export function getLastSeenEtag(datasetId: DatasetId): string | null {
  return ensureSession(datasetId).lastSeenEtag;
}

export function setLastSeenEtag(datasetId: DatasetId, etag: string | null): void {
  patchRemoteDatasetSession(datasetId, { lastSeenEtag: etag });
}

export function getLeaseToken(datasetId: DatasetId): string | null {
  return ensureSession(datasetId).leaseToken;
}

export function setLeaseToken(datasetId: DatasetId, leaseToken: string | null): void {
  patchRemoteDatasetSession(datasetId, { leaseToken });
}

export function getRemoteRole(datasetId: DatasetId): Role | null {
  return ensureSession(datasetId).role;
}

export function setRemoteRole(datasetId: DatasetId, role: Role | null): void {
  patchRemoteDatasetSession(datasetId, { role });
}

/** Test helper: resets all sessions. */
export function _resetRemoteDatasetSessions(): void {
  sessionsByDatasetId.clear();
}
