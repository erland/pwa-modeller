import { useEffect, useMemo, useState } from 'react';

import { Dialog } from '../../dialog/Dialog';
import { listDatasets, openDataset, renameDataset, deleteDataset, useModelStore } from '../../../store';
import type { DatasetId } from '../../../store';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type RowMode =
  | { kind: 'view' }
  | { kind: 'rename'; draft: string };

export function LocalDatasetsDialog({ isOpen, onClose }: Props) {
  const activeDatasetId = useModelStore((s) => s.activeDatasetId);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listDatasets>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, RowMode>>({});
  const [busyId, setBusyId] = useState<DatasetId | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const ds = await listDatasets();
      setRows(ds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list datasets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen]);

  const sortedRows = useMemo(() => rows, [rows]);

  const getMode = (id: DatasetId): RowMode => modes[id] ?? { kind: 'view' };

  const setMode = (id: DatasetId, mode: RowMode) => {
    setModes((prev) => ({ ...prev, [id]: mode }));
  };

  const clearMode = (id: DatasetId) => {
    setModes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const doOpen = async (id: DatasetId) => {
    setBusyId(id);
    setError(null);
    try {
      await openDataset(id);
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open dataset');
    } finally {
      setBusyId(null);
    }
  };

  const doRename = async (id: DatasetId, name: string) => {
    setBusyId(id);
    setError(null);
    try {
      await renameDataset(id, name);
      clearMode(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename dataset');
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (id: DatasetId) => {
    const ok = window.confirm('Delete this local dataset? This cannot be undone.');
    if (!ok) return;

    setBusyId(id);
    setError(null);
    try {
      await deleteDataset(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete dataset');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      title="Local datasets"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {loading ? 'Loading…' : `${sortedRows.length} dataset${sortedRows.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => void refresh()} disabled={loading}>
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
          Local datasets are stored in your browser (IndexedDB). Importing XMI replaces the model in the currently open dataset.
        </div>

        {error ? (
          <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sortedRows.map((r) => {
            const mode = getMode(r.datasetId);
            const isActive = r.datasetId === activeDatasetId;
            const isBusy = busyId === r.datasetId;

            return (
              <div
                key={r.datasetId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))',
                  background: isActive ? 'rgba(100, 150, 255, 0.12)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    {mode.kind === 'rename' ? (
                      <input
                        data-autofocus="true"
                        type="text"
                        value={mode.draft}
                        onChange={(e) => setMode(r.datasetId, { kind: 'rename', draft: e.currentTarget.value })}
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
                    ) : (
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}{isActive ? ' (active)' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span title={r.datasetId}>ID: {String(r.datasetId).slice(0, 24)}{String(r.datasetId).length > 24 ? '…' : ''}</span>
                    <span>Updated: {new Date(r.updatedAt).toLocaleString()}</span>
                    {r.lastOpenedAt ? <span>Opened: {new Date(r.lastOpenedAt).toLocaleString()}</span> : null}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {mode.kind === 'rename' ? (
                    <>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={isBusy || !mode.draft.trim()}
                        onClick={() => void doRename(r.datasetId, mode.draft.trim())}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={isBusy}
                        onClick={() => clearMode(r.datasetId)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={isBusy || isActive}
                        title={isActive ? 'Already active' : 'Open this dataset'}
                        onClick={() => void doOpen(r.datasetId)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={isBusy}
                        onClick={() => setMode(r.datasetId, { kind: 'rename', draft: r.name })}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="shellButton"
                        disabled={isBusy}
                        onClick={() => void doDelete(r.datasetId)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
