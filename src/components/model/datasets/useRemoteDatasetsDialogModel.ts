import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DatasetId } from '../../../store';
import { openDataset, upsertDatasetEntry } from '../../../store';
import { createRemoteDataset, listRemoteDatasets, type RemoteDatasetListItem } from '../../../store/remoteDatasetApi';
import { getRemoteDatasetBackend } from '../../../store/getRemoteDatasetBackend';
import {
  clearRemoteAccessToken,
  loadRemoteDatasetSettings,
  saveRemoteDatasetSettings
} from '../../../store/remoteDatasetSettings';

export type UseRemoteDatasetsDialogModelArgs = {
  isOpen: boolean;
  onClose: () => void;
};

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function asRemoteDatasetId(serverDatasetId: string): DatasetId {
  return (`remote:${serverDatasetId}`) as DatasetId;
}

export function useRemoteDatasetsDialogModel({ isOpen, onClose }: UseRemoteDatasetsDialogModelArgs) {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [rows, setRows] = useState<RemoteDatasetListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  // Load last-used settings when opening.
  useEffect(() => {
    if (!isOpen) return;
    const s = loadRemoteDatasetSettings();
    setBaseUrl(s.remoteServerBaseUrl ?? '');
    setToken(s.remoteAccessToken ?? '');
    setError(null);
    setRows([]);
    setCreateName('');
    setCreateDesc('');
  }, [isOpen]);

  const canConnect = useMemo(() => Boolean(normalizeBaseUrl(baseUrl)) && Boolean(token.trim()), [baseUrl, token]);

  const persistSettings = useCallback(() => {
    const normalized = normalizeBaseUrl(baseUrl);
    saveRemoteDatasetSettings({ remoteServerBaseUrl: normalized, remoteAccessToken: token.trim() ? token.trim() : undefined });
  }, [baseUrl, token]);

  const doClearToken = useCallback(() => {
    clearRemoteAccessToken();
    setToken('');
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const normalized = normalizeBaseUrl(baseUrl);
      const ds = await listRemoteDatasets({ baseUrl: normalized, token: token.trim() });
      setRows(ds);
      // Remember last-used baseUrl/token.
      persistSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list remote datasets');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token, persistSettings]);

  const doCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const normalized = normalizeBaseUrl(baseUrl);
      await createRemoteDataset({ baseUrl: normalized, token: token.trim(), name, description: createDesc.trim() || undefined });
      setCreateName('');
      setCreateDesc('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create remote dataset');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token, createName, createDesc, refresh]);

  const doOpen = useCallback(
    async (serverDatasetId: string, displayName: string) => {
      setBusyId(serverDatasetId);
      setError(null);
      try {
        const normalized = normalizeBaseUrl(baseUrl);
        const datasetId = asRemoteDatasetId(serverDatasetId);

        // Create or update the local user-scoped reference.
        const now = Date.now();
        upsertDatasetEntry({
          datasetId,
          storageKind: 'remote',
          remote: {
            baseUrl: normalized,
            serverDatasetId,
            displayName
          },
          name: displayName,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now
        });

        // Open via the remote backend.
        await openDataset(datasetId, getRemoteDatasetBackend());
        // Remember last-used settings.
        persistSettings();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open remote dataset');
      } finally {
        setBusyId(null);
      }
    },
    [baseUrl, onClose, persistSettings]
  );

  return {
    baseUrl,
    setBaseUrl,
    token,
    setToken,
    canConnect,
    rows,
    loading,
    error,
    busyId,
    createName,
    setCreateName,
    createDesc,
    setCreateDesc,
    persistSettings,
    doClearToken,
    refresh,
    doCreate,
    doOpen
  };
}
