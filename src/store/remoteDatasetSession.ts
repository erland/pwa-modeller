import type { DatasetId } from './datasetTypes';
import type { LeaseConflictResponse, OperationDto, Role } from './remoteDatasetApi';

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
  lastWarnedHeadEtag: string | null;

  // ------------------------
  // Phase 3 (ops-based sync)
  // ------------------------
  /** Latest server revision observed (best-effort). */
  serverRevision: number | null;
  /** Latest revision fully applied to the local model. */
  lastAppliedRevision: number | null;
  /** Local operations not yet accepted by the server. */
  pendingOps: OperationDto[];
  /** Whether the client currently considers the SSE stream connected. */
  sseConnected: boolean;
  /** Optional last seen opId for dedupe if needed. */
  lastSeenOpId: string | null;
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
    role: null,
    lastWarnedHeadEtag: null,

    serverRevision: null,
    lastAppliedRevision: null,
    pendingOps: [],
    sseConnected: false,
    lastSeenOpId: null
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


export function getServerRevision(datasetId: DatasetId): number | null {
  return ensureSession(datasetId).serverRevision;
}

export function setServerRevision(datasetId: DatasetId, serverRevision: number | null): void {
  patchRemoteDatasetSession(datasetId, { serverRevision });
}

export function getLastAppliedRevision(datasetId: DatasetId): number | null {
  return ensureSession(datasetId).lastAppliedRevision;
}

export function setLastAppliedRevision(datasetId: DatasetId, lastAppliedRevision: number | null): void {
  patchRemoteDatasetSession(datasetId, { lastAppliedRevision });
}

export function getPendingOps(datasetId: DatasetId): OperationDto[] {
  return ensureSession(datasetId).pendingOps;
}

export function setPendingOps(datasetId: DatasetId, pendingOps: OperationDto[]): void {
  patchRemoteDatasetSession(datasetId, { pendingOps: [...pendingOps] });
}

export function enqueuePendingOps(datasetId: DatasetId, ...ops: OperationDto[]): void {
  const s = ensureSession(datasetId);
  patchRemoteDatasetSession(datasetId, { pendingOps: [...s.pendingOps, ...ops] });
}

export function shiftPendingOps(datasetId: DatasetId, count: number): OperationDto[] {
  const s = ensureSession(datasetId);
  if (count <= 0) return [];
  if (s.pendingOps.length === 0) return [];

  const taken = s.pendingOps.slice(0, count);
  const remaining = s.pendingOps.slice(count);
  patchRemoteDatasetSession(datasetId, { pendingOps: remaining });
  return taken;
}

export function clearPendingOps(datasetId: DatasetId): void {
  patchRemoteDatasetSession(datasetId, { pendingOps: [] });
}

export function isSseConnected(datasetId: DatasetId): boolean {
  return ensureSession(datasetId).sseConnected;
}

export function setSseConnected(datasetId: DatasetId, sseConnected: boolean): void {
  patchRemoteDatasetSession(datasetId, { sseConnected });
}

export function getLastSeenOpId(datasetId: DatasetId): string | null {
  return ensureSession(datasetId).lastSeenOpId;
}

export function setLastSeenOpId(datasetId: DatasetId, lastSeenOpId: string | null): void {
  patchRemoteDatasetSession(datasetId, { lastSeenOpId });
}


export function getLastWarnedHeadEtag(datasetId: DatasetId): string | null {
  return ensureSession(datasetId).lastWarnedHeadEtag;
}

export function setLastWarnedHeadEtag(datasetId: DatasetId, etag: string | null): void {
  patchRemoteDatasetSession(datasetId, { lastWarnedHeadEtag: etag });
}

/** Test helper: resets all sessions. */
export function _resetRemoteDatasetSessions(): void {
  sessionsByDatasetId.clear();
}
