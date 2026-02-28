import type { DatasetId } from '../datasetTypes';
import type {
  AppendOperationsResponse,
  CurrentSnapshotResponse,
  DuplicateOpIdResponse,
  OperationDto,
  OperationEvent,
  OpsStreamHandle,
  RevisionConflictResponse
} from '../remoteDatasetApi';
import { appendOperations, getCurrentSnapshot, getOperationsSince, openDatasetOpsStream, RemoteDatasetApiError } from '../remoteDatasetApi';
import { modelStore } from '../modelStore';
import type { Model } from '../../domain';
import {
  clearPendingOps,
  getLastAppliedRevision,
  getPendingOps,
  getServerRevision,
  setLastAppliedRevision,
  setServerRevision,
  setSseConnected
} from '../remoteDatasetSession';
import { applyOperationDtosToModel } from '../phase3Ops/applyOperation';

export type RemoteOpsSyncStore = Pick<typeof modelStore, 'getState' | 'hydrate' | 'setPersistenceRemoteChanged'>;

export type RemoteOpsSyncApi = {
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

export type RemoteOpsSyncDeps = {
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
    deps.store.hydrate({ ...st, model: (snapshot.payload as any) ?? null, isDirty: false, activeDatasetId: localDatasetId });
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

  if (st.isDirty) {
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
  deps.store.hydrate({ ...st, model: nextModel, isDirty: false, activeDatasetId: localDatasetId });

  const lastRev = ordered[ordered.length - 1]!.revision;
  setLastAppliedRevision(localDatasetId, lastRev);
  setServerRevision(localDatasetId, lastRev);
}

export function createRemoteOpsSyncController(deps: RemoteOpsSyncDeps): RemoteOpsSyncController {
  const running = new Map<DatasetId, Running>();

  async function runLoop(localDatasetId: DatasetId, serverDatasetId: string): Promise<void> {
    // 1) Catch-up on start (best-effort).
    try {
      const from = (getLastAppliedRevision(localDatasetId) ?? 0) + 1;
      const since = await deps.api.getOperationsSince(serverDatasetId, from);
      await applyEventsSequentially(deps, localDatasetId, since.items ?? []);
    } catch {
      // ignore transient failures
    }

    // 2) Subscribe for live updates.
    let handle: OpsStreamHandle | null = null;
    try {
      const from = (getLastAppliedRevision(localDatasetId) ?? 0) + 1;
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
    const ops = getPendingOps(localDatasetId);
    if (ops.length === 0) return null;

    const baseRevision = getLastAppliedRevision(localDatasetId) ?? 0;

    try {
      const { res } = await deps.api.appendOperations(
        serverDatasetId,
        { baseRevision, operations: ops },
        { leaseToken: opts?.leaseToken ?? undefined, force: opts?.force }
      );

      clearPendingOps(localDatasetId);
      setServerRevision(localDatasetId, res.newRevision);
      setLastAppliedRevision(localDatasetId, res.newRevision);
      return res;
    } catch (e) {
      // Step 7: conflict and replay strategy.
      if (e instanceof RemoteDatasetApiError && e.status === 409) {
        const revConflict = asRevisionConflict(e.body);
        if (revConflict) {
          // Option A: discard local pending ops and reload the latest remote snapshot.
          clearPendingOps(localDatasetId);

          // Best-effort: fetch missing ops and apply if we can do it cleanly.
          try {
            const from = (getLastAppliedRevision(localDatasetId) ?? 0) + 1;
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
          clearPendingOps(localDatasetId);
          setServerRevision(localDatasetId, dup.existingRevision);
          setLastAppliedRevision(localDatasetId, dup.existingRevision);
          return { datasetId: serverDatasetId, newRevision: dup.existingRevision, acceptedCount: ops.length };
        }
      }

      throw e;
    }
  }

  return { start, stop, flushPending };
}

export const remoteOpsSync = createRemoteOpsSyncController({
  store: modelStore,
  api: { appendOperations, getCurrentSnapshot, getOperationsSince, openDatasetOpsStream },
  apply: (model, ops) => applyOperationDtosToModel(model, ops)
});
