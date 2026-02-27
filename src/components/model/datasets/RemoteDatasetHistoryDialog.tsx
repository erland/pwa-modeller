import { useEffect, useMemo, useState } from 'react';

import { Dialog } from '../../dialog/Dialog';
import type { SnapshotHistoryItem } from '../../../store/remoteDatasetApi';

type Props = {
  isOpen: boolean;
  datasetName: string;
  items: SnapshotHistoryItem[];
  loading: boolean;
  error: string | null;
  canRestore: boolean;
  canForceRestore: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRestore: (revision: number, message?: string, opts?: { force?: boolean }) => void;
};

function formatMaybeIso(v: string | null | undefined): string {
  if (!v) return '';
  // Keep as-is; server already returns ISO, and we avoid timezone assumptions.
  return v;
}

export function RemoteDatasetHistoryDialog({
  isOpen,
  datasetName,
  items,
  loading,
  error,
  canRestore,
  canForceRestore,
  onClose,
  onRefresh,
  onRestore
}: Props) {
  const [message, setMessage] = useState('');
  const [forceOverride, setForceOverride] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForceOverride(false);
      setMessage('');
    }
  }, [isOpen]);

  const rows = useMemo(() => {
    return items
      .slice()
      .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));
  }, [items]);

  return (
    <Dialog
      title={`History — ${datasetName}`}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{loading ? 'Loading…' : `${items.length} revision${items.length === 1 ? '' : 's'}`}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="shellButton" onClick={onRefresh} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="shellButton" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="crudHint" style={{ marginTop: 0 }}>
          Select a revision to restore. Optionally provide a restore message (stored on the server).
        </div>

        {error ? (
          <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
            {error}
          </div>
        ) : null}

        <label style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Restore message (optional)</div>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            placeholder="Why are you restoring this revision?"
            style={{
              width: '100%',
              minWidth: 0,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--panelBorder, rgba(255,255,255,0.12))',
              background: 'var(--panelBg, rgba(0,0,0,0.15))',
              color: 'inherit'
            }}
          />
        </label>


        {canForceRestore ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={forceOverride}
              onChange={(e) => setForceOverride(e.currentTarget.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Owner override: restore even if the dataset is locked (uses <code>force=true</code>). This may overwrite newer work.
            </span>
          </label>
        ) : null}

        <div
          style={{
            display: 'grid',
            gap: 8,
            maxHeight: 420,
            overflow: 'auto',
            paddingRight: 4
          }}
        >
          {rows.map((r) => (
            <div
              key={r.revision}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Revision {r.revision}</div>
                <div style={{ fontSize: 12, opacity: 0.8, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {r.updatedAt || r.savedAt ? (
                    <span>
                      {r.updatedAt ? 'Updated' : 'Saved'}: {formatMaybeIso((r.updatedAt ?? r.savedAt) || null)}
                    </span>
                  ) : null}
                  {r.updatedBy || r.savedBy ? (
                    <span>
                      By: {String((r.updatedBy ?? r.savedBy) || '')}
                    </span>
                  ) : null}
                  {typeof r.schemaVersion === 'number' ? <span>Schema: {r.schemaVersion}</span> : null}
                </div>
                {r.message ? <div style={{ fontSize: 12, opacity: 0.85 }}>{r.message}</div> : null}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="shellButton"
                  disabled={loading || !(canRestore || (canForceRestore && forceOverride))}
                  title={!(canRestore || (canForceRestore && forceOverride)) ? 'You need editor/owner role (and an active lease), or owner force override' : 'Restore this revision'}
                  onClick={() => onRestore(r.revision, message.trim() || undefined, { force: Boolean(canForceRestore && forceOverride) })}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}

          {!loading && rows.length === 0 ? <div style={{ fontSize: 12, opacity: 0.8 }}>No history found.</div> : null}
        </div>
      </div>
    </Dialog>
  );
}
