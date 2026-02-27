import type { DatasetId } from './datasetTypes';
import type { LeaseConflictResponse, Role } from './remoteDatasetApi';

/**
 * In-memory per-dataset remote session state.
 *
 * Phase 2 needs the client to remember per dataset:
 *  - lastSeenEtag: optimistic concurrency token for snapshot writes
 *  - leaseToken:   server-issued token required for protected writes
 *  - leaseExpiresAt: server-provided expiry (best-effort; used for UX/debug)
 *  - leaseConflict: last lease conflict info (best-effort; UX in Step 6)
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
  leaseExpiresAt: string | null;
  leaseConflict: LeaseConflictResponse | null;
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
    leaseExpiresAt: null,
    leaseConflict: null,
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
  // Clearing token should also clear conflict (caller can set conflict explicitly).
  patchRemoteDatasetSession(datasetId, { leaseToken, leaseConflict: leaseToken ? null : ensureSession(datasetId).leaseConflict });
}

export function getLeaseExpiresAt(datasetId: DatasetId): string | null {
  return ensureSession(datasetId).leaseExpiresAt;
}

export function setLeaseExpiresAt(datasetId: DatasetId, leaseExpiresAt: string | null): void {
  patchRemoteDatasetSession(datasetId, { leaseExpiresAt });
}

export function getLeaseConflict(datasetId: DatasetId): LeaseConflictResponse | null {
  return ensureSession(datasetId).leaseConflict;
}

export function setLeaseConflict(datasetId: DatasetId, conflict: LeaseConflictResponse | null): void {
  patchRemoteDatasetSession(datasetId, { leaseConflict: conflict });
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
