import type { DatasetId } from '../datasetTypes';
import type {
  AppendOperationsResponse,
  CurrentSnapshotResponse,
  DuplicateOpIdResponse,
  LeaseConflictResponse,
  OperationDto,
  OperationEvent,
  OpsStreamHandle,
  RevisionConflictResponse
} from '../remoteDatasetApi';
import {
  acquireOrRefreshLease,
  appendOperations,
  getCurrentSnapshot,
  getOperationsSince,
  openDatasetOpsStream,
  RemoteDatasetApiError
} from '../remoteDatasetApi';
import { modelStore } from '../modelStore';
import type { Model } from '../../domain';
import { createEmptyModel } from '../../domain/factories';
import {
  clearPendingOps,
  getLastAppliedRevision,
  getLeaseToken,
  getPendingOps,
  getServerRevision,
  setLastAppliedRevision,
  setLeaseConflict,
  setLeaseExpiresAt,
  setLeaseToken,
  setPendingOps,
  setServerRevision,
  setSseConnected
} from '../remoteDatasetSession';
import { applyOperationDtosToModel } from '../phase3Ops/applyOperation';

export type RemoteOpsSyncStore = Pick<typeof modelStore, 'getState' | 'hydrate' | 'setPersistenceRemoteChanged'>;

export type RemoteOpsSyncApi = {
  acquireOrRefreshLease: typeof acquireOrRefreshLease;
  appendOperations: typeof appendOperations;
  getCurrentSnapshot: typeof getCurrentSnapshot;
  getOperationsSince: typeof getOperationsSince;
  openDatasetOpsStream: typeof openDatasetOpsStream;
};

export type RemoteOpsSyncApply = (model: Model, ops: OperationDto[]) => Model;

export type RemoteOpsSyncController = {
  start: (localDatasetId: DatasetId, serverDatasetId: string) => void;
  stop: (localDatasetId: DatasetId) => void;
  /** Best-effort: send pending ops to server (conflict strategy added in Step 7). */
  flushPending: (
    localDatasetId: DatasetId,
    serverDatasetId: string,
    opts?: { leaseToken?: string | null; force?: boolean }
  ) => Promise<AppendOperationsResponse | null>;
};

export function extractModelFromSnapshotPayload(payload: unknown): unknown {
  // Server snapshot payload is often wrapped, but some flows may wrap further.
  // We want to end up with the modeller Model object.
  if (!payload || typeof payload !== 'object') return payload;
  const p: any = payload as any;

  // Most common: { schemaVersion, model: <Model> }
  if (p.model && typeof p.model === 'object') {
    // Defensive: some flows stored a persisted slice as 'model'.
    if (p.model.model && typeof p.model.model === 'object') return p.model.model;
    return p.model;
  }

  return payload;
}

function isModelLike(v: unknown): v is Model {
  if (!v || typeof v !== 'object') return false;
  const o: any = v as any;
  return (
    o.metadata &&
    typeof o.metadata === 'object' &&
    typeof o.metadata.name === 'string' &&
    o.elements &&
    typeof o.elements === 'object' &&
    o.folders &&
    typeof o.folders === 'object' &&
    o.views &&
    typeof o.views === 'object'
  );
}

function ensureModel(v: unknown): Model {
  return isModelLike(v) ? v : createEmptyModel({ name: 'Remote model' });
}

type RemoteOpsSyncDeps = {
  store: RemoteOpsSyncStore;
  api: RemoteOpsSyncApi;
  apply: RemoteOpsSyncApply;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function asRevisionConflict(body: unknown): RevisionConflictResponse | null {
  if (!isObject(body)) return null;
  if (typeof body.currentRevision !== 'number') return null;
  const datasetId = typeof body.datasetId === 'string' ? body.datasetId : '';
  return { datasetId, currentRevision: body.currentRevision };
}

function asDuplicateOpId(body: unknown): DuplicateOpIdResponse | null {
  if (!isObject(body)) return null;
  if (typeof body.opId !== 'string') return null;
  if (typeof body.existingRevision !== 'number') return null;
  const datasetId = typeof body.datasetId === 'string' ? body.datasetId : '';
  return { datasetId, opId: body.opId, existingRevision: body.existingRevision };
}

function asLeaseConflict(body: unknown): LeaseConflictResponse | null {
  if (!isObject(body)) return null;
  if (typeof body.holderSub !== 'string') return null;
  if (typeof body.expiresAt !== 'string') return null;
  const datasetId = typeof body.datasetId === 'string' ? body.datasetId : '';
  return { datasetId, holderSub: body.holderSub, expiresAt: body.expiresAt };
}

function isLeaseTokenRequiredError(e: RemoteDatasetApiError): boolean {
  if (e.status !== 428) return false;
  const body = e.body as any;
  const code = (body?.code ?? body?.errorCode ?? '') as string;
  return code === 'LEASE_TOKEN_REQUIRED' || code === 'LEASE_TOKEN_MISSING' || code === 'LEASE_REQUIRED';
}

async function reloadSnapshotAfterConflict(
  deps: RemoteOpsSyncDeps,
  localDatasetId: DatasetId,
  serverDatasetId: string
): Promise<CurrentSnapshotResponse | null> {
  try {
    const { snapshot } = await deps.api.getCurrentSnapshot(serverDatasetId);
    const st = deps.store.getState();
    if (st.activeDatasetId !== localDatasetId) return null;

    // Snapshot payload is the modeller JSON model.
    deps.store.hydrate({
      ...st,
      model: ensureModel(extractModelFromSnapshotPayload(snapshot.payload)),
      isDirty: false,
      activeDatasetId: localDatasetId
    });
    setServerRevision(localDatasetId, snapshot.revision);
    setLastAppliedRevision(localDatasetId, snapshot.revision);
    return snapshot;
  } catch {
    return null;
  }
}

type Running = {
  serverDatasetId: string;
  stream: OpsStreamHandle | null;
  stopRequested: boolean;
  loop: Promise<void>;
};

async function applyEventsSequentially(deps: RemoteOpsSyncDeps, localDatasetId: DatasetId, events: OperationEvent[]): Promise<void> {
  if (events.length === 0) return;
  const ordered = [...events].sort((a, b) => a.revision - b.revision);

  const st = deps.store.getState();
  if (st.activeDatasetId !== localDatasetId) return;

  const latestRevision = ordered[ordered.length - 1]?.revision ?? null;
  if (latestRevision != null) setServerRevision(localDatasetId, latestRevision);

  // NOTE: the store's isDirty flag is not a reliable indicator of whether there
  // are unsent remote changes. For remote datasets we persist via ops and clear
  // the pending ops queue on success, but isDirty may remain true.
  // We only block auto-apply when there are pending local ops (i.e. a true
  // "unsaved" remote state that would need a merge/rebase strategy).
  const pendingCount = getPendingOps(localDatasetId).length;
  if (st.isDirty && pendingCount > 0) {
    deps.store.setPersistenceRemoteChanged({
      datasetId: localDatasetId,
      message: 'Remote dataset changed while you have local unsaved changes.',
      detectedAt: Date.now(),
      serverRevision: latestRevision ?? (getServerRevision(localDatasetId) ?? 0),
      serverEtag: null,
      serverUpdatedAt: null,
      serverUpdatedBy: null
    });
    return;
  }

  const currentApplied = getLastAppliedRevision(localDatasetId) ?? 0;
  const toApply = ordered.filter(e => e.revision > currentApplied).map(e => e.op);
  if (toApply.length === 0) {
    if (latestRevision != null) setLastAppliedRevision(localDatasetId, Math.max(currentApplied, latestRevision));
    return;
  }

  if (!st.model) return;
  const nextModel = deps.apply(st.model, toApply);
  deps.store.hydrate({ ...st, model: ensureModel(nextModel), isDirty: false, activeDatasetId: localDatasetId });

  const lastRev = ordered[ordered.length - 1]!.revision;
  setLastAppliedRevision(localDatasetId, lastRev);
  setServerRevision(localDatasetId, lastRev);
}

export function createRemoteOpsSyncController(deps: RemoteOpsSyncDeps): RemoteOpsSyncController {
  const running = new Map<DatasetId, Running>();
  const flushInFlight = new Map<DatasetId, Promise<AppendOperationsResponse | null>>();


  async function runLoop(localDatasetId: DatasetId, serverDatasetId: string): Promise<void> {
    // 1) Catch-up on start (best-effort).
    try {
      const from = getLastAppliedRevision(localDatasetId) ?? 0;
      const since = await deps.api.getOperationsSince(serverDatasetId, from);
      await applyEventsSequentially(deps, localDatasetId, since.items ?? []);
    } catch {
      // ignore transient failures
    }

    // 2) Subscribe for live updates.
    let handle: OpsStreamHandle | null = null;
    try {
      const from = getLastAppliedRevision(localDatasetId) ?? 0;
      handle = await deps.api.openDatasetOpsStream(serverDatasetId, { fromRevision: from });
      setSseConnected(localDatasetId, true);
      const entry = running.get(localDatasetId);
      if (entry) entry.stream = handle;

      for await (const ev of handle.events) {
        const entry2 = running.get(localDatasetId);
        if (!entry2 || entry2.stopRequested) break;
        await applyEventsSequentially(deps, localDatasetId, [ev]);
      }
    } catch {
      // ignore transient failures
    } finally {
      setSseConnected(localDatasetId, false);
      if (handle) {
        try {
          handle.close();
        } catch {
          // ignore
        }
      }
      const entry = running.get(localDatasetId);
      if (entry) entry.stream = null;
    }
  }

  function start(localDatasetId: DatasetId, serverDatasetId: string): void {
    if (running.has(localDatasetId)) return;
    const entry: Running = {
      serverDatasetId,
      stream: null,
      stopRequested: false,
      loop: Promise.resolve()
    };
    running.set(localDatasetId, entry);
    entry.loop = runLoop(localDatasetId, serverDatasetId);
  }

  function stop(localDatasetId: DatasetId): void {
    const entry = running.get(localDatasetId);
    if (!entry) return;
    entry.stopRequested = true;
    if (entry.stream) {
      try {
        entry.stream.close();
      } catch {
        // ignore
      }
    }
    running.delete(localDatasetId);
    setSseConnected(localDatasetId, false);
  }

  async function flushPending(
    localDatasetId: DatasetId,
    serverDatasetId: string,
    opts?: { leaseToken?: string | null; force?: boolean }
  ): Promise<AppendOperationsResponse | null> {
    const inFlight = flushInFlight.get(localDatasetId);
    if (inFlight) return inFlight;

    const promise = (async () => {
    // The server broadcasts appended ops back to subscribers (including the
    // sender) via SSE. If we keep pending ops queued while the append request
    // is in-flight, we can receive our own op event while
    // `st.isDirty && pendingOps.length > 0` and incorrectly show the
    // "Remote dataset changed" dialog.
    //
    // To avoid this, we take a snapshot of the current pending ops and clear
    // the queue before sending. If the request fails, we restore the ops only
    // if no newer local edits were queued in the meantime.
    const opsToSend = getPendingOps(localDatasetId);
    if (opsToSend.length === 0) return null;

    clearPendingOps(localDatasetId);

    const baseRevision = getLastAppliedRevision(localDatasetId) ?? 0;

    const initialLeaseToken = (opts?.leaseToken ?? getLeaseToken(localDatasetId) ?? '').trim() || null;

    async function tryAppend(leaseToken: string | null): Promise<{ res: AppendOperationsResponse; etag: string | null }> {
      return deps.api.appendOperations(
        serverDatasetId,
        { baseRevision, operations: opsToSend },
        { leaseToken: leaseToken ?? undefined, force: opts?.force }
      );
    }

    try {
      const { res } = await tryAppend(initialLeaseToken);

      setServerRevision(localDatasetId, res.newRevision);
      setLastAppliedRevision(localDatasetId, res.newRevision);
      return res;
    } catch (e) {
      // Step 8: integrate leases for ops endpoints.
      if (e instanceof RemoteDatasetApiError) {
        // Lease required: acquire/refresh and retry once.
        if (isLeaseTokenRequiredError(e)) {
          try {
            const { lease } = await deps.api.acquireOrRefreshLease(serverDatasetId);
            if (lease.active && lease.leaseToken) {
              setLeaseToken(localDatasetId, lease.leaseToken);
              setLeaseExpiresAt(localDatasetId, lease.expiresAt);
              setLeaseConflict(localDatasetId, null);

              const { res } = await tryAppend(lease.leaseToken);
              setServerRevision(localDatasetId, res.newRevision);
              setLastAppliedRevision(localDatasetId, res.newRevision);
              return res;
            }
          } catch {
            // fall through to throw the original error
          }
        }

        // Lease conflict: store conflict so existing UX can surface it.
        if (e.status === 409) {
          const leaseConflict = asLeaseConflict(e.body);
          if (leaseConflict) {
            setLeaseToken(localDatasetId, null);
            setLeaseExpiresAt(localDatasetId, null);
            setLeaseConflict(localDatasetId, leaseConflict);
          }
        }
      }

      // Step 7: conflict and replay strategy.
      if (e instanceof RemoteDatasetApiError && e.status === 409) {
        const revConflict = asRevisionConflict(e.body);
        if (revConflict) {
          // Option A: discard local pending ops and reload the latest remote snapshot.
          // (We already cleared before sending; ensure we don't restore.)

          // Best-effort: fetch missing ops and apply if we can do it cleanly.
          try {
            const from = getLastAppliedRevision(localDatasetId) ?? 0;
            const since = await deps.api.getOperationsSince(serverDatasetId, from);
            await applyEventsSequentially(deps, localDatasetId, since.items ?? []);
          } catch {
            // ignore
          }

          const snap = await reloadSnapshotAfterConflict(deps, localDatasetId, serverDatasetId);

          deps.store.setPersistenceRemoteChanged({
            datasetId: localDatasetId,
            message:
              'Remote dataset changed before your edits were saved. Your pending local edits were discarded; reload and reapply your changes if needed.',
            detectedAt: Date.now(),
            serverRevision: snap?.revision ?? revConflict.currentRevision,
            serverEtag: null,
            serverUpdatedAt: snap?.updatedAt ?? null,
            serverUpdatedBy: snap?.updatedBy ?? null
          });

          return null;
        }

        const dup = asDuplicateOpId(e.body);
        if (dup) {
          // Treat idempotency conflict as success.
          setServerRevision(localDatasetId, dup.existingRevision);
          setLastAppliedRevision(localDatasetId, dup.existingRevision);
          return { datasetId: serverDatasetId, newRevision: dup.existingRevision, acceptedCount: opsToSend.length };
        }
      }

      // Restore ops if the send failed and no newer local edits were queued.
      if (getPendingOps(localDatasetId).length === 0) {
        setPendingOps(localDatasetId, opsToSend);
      }
      throw e;
    }
    })();

    flushInFlight.set(localDatasetId, promise);
    try {
      return await promise;
    } finally {
      flushInFlight.delete(localDatasetId);
    }
  }

  return { start, stop, flushPending };
}

export const remoteOpsSync = createRemoteOpsSyncController({
  store: modelStore,
  api: { acquireOrRefreshLease, appendOperations, getCurrentSnapshot, getOperationsSince, openDatasetOpsStream },
  apply: (model, ops) => applyOperationDtosToModel(model, ops)
});
