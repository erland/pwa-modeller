import { useCallback, useEffect, useMemo, useState } from 'react';

import { deleteDataset, listDatasets, openDataset, renameDataset, useModelStore } from '../../../store';
import type { DatasetId } from '../../../store';

export type LocalDatasetRow = Awaited<ReturnType<typeof listDatasets>>[number];

export type RowMode =
  | { kind: 'view' }
  | { kind: 'rename'; draft: string };

export type UseLocalDatasetsDialogModelArgs = {
  isOpen: boolean;
  onClose: () => void;
};

export function useLocalDatasetsDialogModel({ isOpen, onClose }: UseLocalDatasetsDialogModelArgs) {
  const activeDatasetId = useModelStore((s) => s.activeDatasetId);

  const [rows, setRows] = useState<LocalDatasetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, RowMode>>({});
  const [busyId, setBusyId] = useState<DatasetId | null>(null);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  const sortedRows = useMemo(() => rows, [rows]);

  const getMode = useCallback(
    (id: DatasetId): RowMode => modes[id] ?? { kind: 'view' },
    [modes]
  );

  const setMode = useCallback((id: DatasetId, mode: RowMode) => {
    setModes((prev) => ({ ...prev, [id]: mode }));
  }, []);

  const clearMode = useCallback((id: DatasetId) => {
    setModes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const doOpen = useCallback(
    async (id: DatasetId) => {
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
    },
    [onClose, refresh]
  );

  const doRename = useCallback(
    async (id: DatasetId, name: string) => {
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
    },
    [clearMode, refresh]
  );

  const doDelete = useCallback(
    async (id: DatasetId) => {
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
    },
    [refresh]
  );

  return {
    activeDatasetId,
    rows: sortedRows,
    loading,
    error,
    busyId,
    getMode,
    setMode,
    clearMode,
    refresh,
    doOpen,
    doRename,
    doDelete
  };
}
