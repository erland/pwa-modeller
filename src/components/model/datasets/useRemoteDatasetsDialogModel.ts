import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DatasetId } from '../../../store';
import { openDataset, upsertDatasetEntry } from '../../../store';
import { setRemoteRole } from '../../../store/remoteDatasetSession';
import { createRemoteDataset, listRemoteDatasets, type RemoteDatasetListItem, type ValidationPolicy } from '../../../store/remoteDatasetApi';
import { getRemoteDatasetBackend } from '../../../store/getRemoteDatasetBackend';
import {
  loadRemoteDatasetSettings,
  saveRemoteDatasetSettings
} from '../../../store/remoteDatasetSettings';
import { beginLogin, clearTokens, isLoggedIn } from '../../../auth/oidcPkceAuth';

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
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [scope, setScope] = useState('openid profile email');
  const [rows, setRows] = useState<RemoteDatasetListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [loggedIn, setLoggedIn] = useState(false);
  const didAutoRefreshRef = useRef(false);

  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createValidationPolicy, setCreateValidationPolicy] = useState<ValidationPolicy>('none');

  // Load last-used settings when opening.
  useEffect(() => {
    if (!isOpen) return;
    const s = loadRemoteDatasetSettings();
    setBaseUrl(s.remoteServerBaseUrl ?? '');
    setIssuerUrl(s.oidcIssuerUrl ?? '');
    setClientId(s.oidcClientId ?? '');
    setScope((s.oidcScope ?? 'openid profile email').trim() || 'openid profile email');
    setLoggedIn(isLoggedIn());
    didAutoRefreshRef.current = false;
    setError(null);
    setRows([]);
    setCreateName('');
    setCreateDesc('');
    setCreateValidationPolicy('none');
    setCreateValidationPolicy('none');
  }, [isOpen]);


  // Keep auth state in sync while the dialog is open (e.g. after PKCE redirect completes).
  useEffect(() => {
    if (!isOpen) return;

    const sync = () => {
      const li = isLoggedIn();
      setLoggedIn(li);
      if (!li) {
        setRows([]);
        didAutoRefreshRef.current = false;
      }
    };

    const onAuthChanged = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'oidc.pkce.tokens.local.v1' || e.key === 'oidc.pkce.authChangedAt.v1') sync();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };

    window.addEventListener('pwaModellerAuthChanged', onAuthChanged);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);

    // Initial sync (covers the "first sign-in" timing issue).
    sync();

    return () => {
      window.removeEventListener('pwaModellerAuthChanged', onAuthChanged);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOpen]);




  const canConnect = useMemo(() => Boolean(normalizeBaseUrl(baseUrl)) && loggedIn, [baseUrl, loggedIn]);
  const canSignIn = useMemo(() => Boolean(issuerUrl.trim()) && Boolean(clientId.trim()), [issuerUrl, clientId]);

  const persistSettings = useCallback(() => {
    const normalized = normalizeBaseUrl(baseUrl);
    saveRemoteDatasetSettings({
      remoteServerBaseUrl: normalized,
      oidcIssuerUrl: issuerUrl.trim(),
      oidcClientId: clientId.trim(),
      oidcScope: scope.trim() || 'openid profile email'
    });
  }, [baseUrl, issuerUrl, clientId, scope]);

  const doSignIn = useCallback(async () => {
    setError(null);
    try {
      persistSettings();
      await beginLogin(
        { issuerUrl: issuerUrl.trim(), clientId: clientId.trim(), scope: scope.trim() || undefined },
        {
          // Return to wherever the user initiated login from (may include #hash routes).
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          // Let the app reopen this dialog after redirect.
          afterLogin: 'openRemoteDatasetsDialog'
        }
      );
      // beginLogin redirects; this line typically won't run.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start sign-in');
    }
  }, [issuerUrl, clientId, scope, persistSettings]);

  const doSignOut = useCallback(() => {
    clearTokens();
    setLoggedIn(false);
    setRows([]);
    didAutoRefreshRef.current = false;
    setCreateName('');
    setCreateDesc('');
    setCreateValidationPolicy('none');
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const normalized = normalizeBaseUrl(baseUrl);
      const ds = await listRemoteDatasets({ baseUrl: normalized });
      // Capture server-returned role per dataset for later lease decisions.
      for (const row of ds) {
        const remoteId = asRemoteDatasetId(row.datasetId);
        setRemoteRole(remoteId, row.role ?? null);
      }
      setRows(ds);
      // Remember last-used baseUrl/token.
      persistSettings();
      setLoggedIn(isLoggedIn());
    didAutoRefreshRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list remote datasets');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, persistSettings]);


  // Auto-refresh remote dataset list when the dialog opens and the user is signed in.
  useEffect(() => {
    if (!isOpen) return;
    if (!loggedIn) return;
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return;
    if (didAutoRefreshRef.current) return;
    didAutoRefreshRef.current = true;
    void refresh();
  }, [isOpen, loggedIn, baseUrl, refresh]);

  const doCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const normalized = normalizeBaseUrl(baseUrl);
      await createRemoteDataset({
        baseUrl: normalized,
        name,
        description: createDesc.trim() || undefined,
        validationPolicy: createValidationPolicy
      });
      setCreateName('');
      setCreateDesc('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create remote dataset');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, createName, createDesc, createValidationPolicy, refresh]);

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
    issuerUrl,
    setIssuerUrl,
    clientId,
    setClientId,
    scope,
    setScope,
    loggedIn,
    canConnect,
    canSignIn,
    rows,
    loading,
    error,
    busyId,
    createName,
    setCreateName,
    createDesc,
    setCreateDesc,
    createValidationPolicy,
    setCreateValidationPolicy,
    persistSettings,
    doSignIn,
    doSignOut,
    refresh,
    doCreate,
    doOpen
  };
}
