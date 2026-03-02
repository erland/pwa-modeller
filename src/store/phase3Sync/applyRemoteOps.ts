import type { DatasetId } from '../datasetTypes';
import type { OperationDto, OperationEvent } from '../remoteDatasetApi';
import type { Model } from '../../domain';
import { createEmptyModel } from '../../domain/factories';
import {
  getLastAppliedRevision,
  getPendingOps,
  getServerRevision,
  setLastAppliedRevision,
  setServerRevision
} from '../remoteDatasetSession';
import type { RemoteOpsSyncApply, RemoteOpsSyncStore } from './remoteOpsSync';

/**
 * Pure-ish (no network) helpers for applying remote operations/events to the local store.
 *
 * This file intentionally contains:
 * - snapshot payload extraction + model guards
 * - in-flight op tracking (for echo suppression)
 * - deterministic apply logic (hydrate + revision bookkeeping)
 */

export type ApplyRemoteOpsDeps = {
  store: RemoteOpsSyncStore;
  apply: RemoteOpsSyncApply;
};

// Tracks operation IDs currently being appended to the server for each dataset.
// Used to avoid false "Remote dataset changed" prompts when the server echoes
// back our own operations while there are pending local edits.
const inFlightOpIdsByDataset = new Map<DatasetId, Set<string>>();

export function setInFlightOpIds(datasetId: DatasetId, ops: OperationDto[] | null): void {
  if (!ops || ops.length === 0) {
    inFlightOpIdsByDataset.delete(datasetId);
    return;
  }
  inFlightOpIdsByDataset.set(datasetId, new Set(ops.map(o => o.opId)));
}

function getOutstandingLocalOpIds(datasetId: DatasetId): Set<string> {
  const ids = new Set<string>();
  for (const op of getPendingOps(datasetId)) ids.add(op.opId);
  const inflight = inFlightOpIdsByDataset.get(datasetId);
  if (inflight) for (const id of inflight) ids.add(id);
  return ids;
}

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

export function ensureModel(v: unknown): Model {
  return isModelLike(v) ? v : createEmptyModel({ name: 'Remote model' });
}

export async function applyEventsSequentially(deps: ApplyRemoteOpsDeps, localDatasetId: DatasetId, events: OperationEvent[]): Promise<void> {
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
    const outstanding = getOutstandingLocalOpIds(localDatasetId);
    const incomingOpIds = ordered.map(e => e.op?.opId).filter((x): x is string => typeof x === 'string');
    const isOnlyEcho = incomingOpIds.length > 0 && incomingOpIds.every(id => outstanding.has(id));
    if (isOnlyEcho) {
      // Server echoed our own operations while we still have local pending edits.
      // Treat as an acknowledgement and do not prompt the user.
      if (latestRevision != null) setLastAppliedRevision(localDatasetId, Math.max(getLastAppliedRevision(localDatasetId) ?? 0, latestRevision));
      return;
    }
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
