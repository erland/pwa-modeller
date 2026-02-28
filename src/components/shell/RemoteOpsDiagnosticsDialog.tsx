import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../dialog/Dialog';
import type { DatasetId } from '../../store/datasetTypes';
import {
  getLastAppliedRevision,
  getLastSeenEtag,
  getLastSeenOpId,
  getLeaseExpiresAt,
  getLeaseToken,
  getPendingOps,
  getRemoteRole,
  getServerRevision,
  getLeaseConflict,
  isSseConnected
} from '../../store/remoteDatasetSession';
import { isPhase3OpsEnabled } from '../../store/remoteDatasetSettings';
import { getDatasetRegistryEntry } from '../../store/datasetRegistry';

type Props = {
  isOpen: boolean;
  datasetId: DatasetId | null;
  onClose: () => void;
};

type Snapshot = {
  datasetId: DatasetId;
  phase3Enabled: boolean;
  storageKind: string | null;
  role: string | null;
  sseConnected: boolean;
  serverRevision: number | null;
  lastAppliedRevision: number | null;
  pendingOpsCount: number;
  lastSeenOpId: string | null;
  lastSeenEtag: string | null;
  leaseTokenPresent: boolean;
  leaseExpiresAt: string | null;
  leaseConflict: {
    holderSub: string | null;
    expiresAt: string | null;
  } | null;
};

function readSnapshot(datasetId: DatasetId): Snapshot {
  const entry = getDatasetRegistryEntry(datasetId);
  const pendingOps = getPendingOps(datasetId);

  const leaseConflict = getLeaseConflict(datasetId);
  return {
    datasetId,
    phase3Enabled: isPhase3OpsEnabled(),
    storageKind: entry?.storageKind ?? null,
    role: getRemoteRole(datasetId),
    sseConnected: isSseConnected(datasetId),
    serverRevision: getServerRevision(datasetId),
    lastAppliedRevision: getLastAppliedRevision(datasetId),
    pendingOpsCount: pendingOps.length,
    lastSeenOpId: getLastSeenOpId(datasetId),
    lastSeenEtag: getLastSeenEtag(datasetId),
    leaseTokenPresent: Boolean(getLeaseToken(datasetId)),
    leaseExpiresAt: getLeaseExpiresAt(datasetId),
    leaseConflict: leaseConflict
      ? { holderSub: leaseConflict.holderSub, expiresAt: leaseConflict.expiresAt }
      : null
  };
}

export function RemoteOpsDiagnosticsDialog({ isOpen, datasetId, onClose }: Props) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!isOpen || !datasetId) return;

    let alive = true;
    const tick = () => {
      if (!alive) return;
      setSnap(readSnapshot(datasetId));
    };

    // Initial read + lightweight polling while open.
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isOpen, datasetId]);

  const json = useMemo(() => (snap ? JSON.stringify(snap, null, 2) : ''), [snap]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Remote sync diagnostics"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      {!datasetId ? (
        <div>No active dataset.</div>
      ) : !snap ? (
        <div>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div><strong>Dataset:</strong> {snap.datasetId}</div>
            <div>
              <strong>Phase 3 ops:</strong> {snap.phase3Enabled ? 'enabled' : 'disabled'}{' '}
              {snap.storageKind ? `(storage: ${snap.storageKind})` : null}
            </div>
            <div><strong>Role:</strong> {snap.role ?? 'unknown'}</div>
            <div><strong>SSE connected:</strong> {snap.sseConnected ? 'yes' : 'no'}</div>
            <div><strong>Server revision:</strong> {snap.serverRevision ?? '—'}</div>
            <div><strong>Last applied revision:</strong> {snap.lastAppliedRevision ?? '—'}</div>
            <div><strong>Pending ops:</strong> {snap.pendingOpsCount}</div>
            <div><strong>Last seen op id:</strong> {snap.lastSeenOpId ?? '—'}</div>
            <div><strong>Last seen ETag:</strong> {snap.lastSeenEtag ?? '—'}</div>
            <div><strong>Lease token:</strong> {snap.leaseTokenPresent ? 'present' : 'missing'}</div>
            <div><strong>Lease expires:</strong> {snap.leaseExpiresAt ?? '—'}</div>
            <div>
              <strong>Lease conflict:</strong>{' '}
              {snap.leaseConflict
                ? `${snap.leaseConflict.holderSub ?? 'unknown'} (expires: ${snap.leaseConflict.expiresAt ?? '—'})`
                : 'none'}
            </div>
          </div>

          <details>
            <summary>Raw JSON</summary>
            <pre style={{ marginTop: 8, maxHeight: 280, overflow: 'auto' }}>{json}</pre>
          </details>
        </div>
      )}
    </Dialog>
  );
}