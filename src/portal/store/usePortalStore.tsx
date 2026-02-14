import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../domain';
import type { PortalIndexes } from '../indexes/portalIndexes';
import { getPortalRootFolderId } from '../navigation/portalNavSource';
import { clearCacheForLatestUrl } from '../data/portalCache';
import type { LatestPointer, PublishManifest } from '../data/portalDataset';
import { loadPortalBundle } from '../data/portalLoader';
import { checkPortalForUpdate } from '../data/portalUpdater';
import { normalizeString, type PortalChannelSource, type PortalLatestUrlSource, type PortalLatestUrlState } from './portalConfig';
import { formatPortalError } from './portalErrors';
import { PORTAL_CHANNEL_LOCALSTORAGE_KEY, PORTAL_LATEST_URL_LEGACY_KEY, portalLatestUrlKeyForChannel } from './portalLocalStorage';
import { resolvePortalStartup } from './portalInit';

export type PortalDatasetMeta = {
  title?: string;
  bundleId: string;
  createdAt?: string;
  schemaVersion?: number;
  latestUrl: string;
  manifestUrl: string;
  loadedFromCache?: boolean;
  indexesDerived?: boolean;
};

export type PortalLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type PortalUpdateInfo =
  | { state: 'none' }
  | { state: 'checking' }
  | { state: 'available'; currentBundleId: string; latestBundleId: string; latestTitle?: string }
  | { state: 'error'; message: string };

export type PortalStoreState = {
  latest: PortalLatestUrlState;

  status: PortalLoadStatus;
  error: string | null;

  datasetMeta: PortalDatasetMeta | null;
  model: Model | null;
  indexes: PortalIndexes | null;

  rootFolderId: string | null;

  updateInfo: PortalUpdateInfo;

  setChannel: (channel: string, source?: PortalChannelSource) => void;
  setLatestUrl: (latestUrl: string | null, source?: PortalLatestUrlSource) => void;

  load: (latestUrl?: string) => Promise<void>;
  checkForUpdate: () => Promise<{ updateAvailable: boolean; latest?: LatestPointer }>;
  applyUpdate: () => Promise<void>;
  clearCache: () => Promise<void>;
};

const PortalStoreContext = createContext<PortalStoreState | null>(null);

export function PortalStoreProvider({ children }: { children: ReactNode }) {
  const [channel, setChannelState] = useState<string>('prod');
  const [channelSource, setChannelSource] = useState<PortalChannelSource | null>(null);

  const [latestUrl, setLatestUrlState] = useState<string | null>(null);
  const [latestUrlSource, setLatestUrlSource] = useState<PortalLatestUrlSource | null>(null);

  const [status, setStatus] = useState<PortalLoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const [datasetMeta, setDatasetMeta] = useState<PortalDatasetMeta | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [indexes, setIndexes] = useState<PortalIndexes | null>(null);
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);

  const [updateInfo, setUpdateInfo] = useState<PortalUpdateInfo>({ state: 'none' });

  // Resolve channel + latestUrl on startup
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const resolved = await resolvePortalStartup();

      if (!isMounted) return;
      setChannelState(resolved.channel);
      setChannelSource(resolved.channelSource);
      setLatestUrlState(resolved.latestUrl);
      setLatestUrlSource(resolved.latestUrlSource);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setChannel = (c: string, source?: PortalChannelSource) => {
    const normalized = normalizeString(c) ?? 'prod';
    setChannelState(normalized);
    if (source) setChannelSource(source);
    try {
      window.localStorage.setItem(PORTAL_CHANNEL_LOCALSTORAGE_KEY, normalized);
    } catch {
      // ignore
    }

    // When switching channel, attempt to load that channel's saved URL immediately.
    try {
      const saved = normalizeString(window.localStorage.getItem(portalLatestUrlKeyForChannel(normalized)));
      if (saved) {
        setLatestUrlState(saved);
        setLatestUrlSource('localStorage');
      }
    } catch {
      // ignore
    }
  };

  const setLatestUrl = (url: string | null, source?: PortalLatestUrlSource) => {
    setLatestUrlState(url);
    if (source) setLatestUrlSource(source);
  };

  const applyBundleToState = useCallback(
    ({
      latestUrl,
      latest,
      manifestUrl,
      manifest,
      model,
      indexes,
      loadedFromCache,
      indexesDerived
    }: {
      latestUrl: string;
      latest: LatestPointer;
      manifestUrl: string;
      manifest: PublishManifest;
      model: Model;
      indexes: PortalIndexes;
      loadedFromCache?: boolean;
      indexesDerived?: boolean;
    }) => {
      setDatasetMeta({
        title: latest.title,
        bundleId: manifest.bundleId,
        createdAt: manifest.createdAt,
        schemaVersion: manifest.schemaVersion,
        latestUrl,
        manifestUrl,
        loadedFromCache,
        indexesDerived
      });
      setModel(model);
      setIndexes(indexes);
      setRootFolderId(getPortalRootFolderId(model));
    },
    []
  );

  const load = useCallback(
    async (overrideLatestUrl?: string) => {
      const url = (overrideLatestUrl ?? latestUrl)?.trim();
      if (!url) return;

      setStatus('loading');
      setError(null);
      setUpdateInfo({ state: 'none' });

      // Persist for active channel
      try {
        window.localStorage.setItem(PORTAL_LATEST_URL_LEGACY_KEY, url);
        window.localStorage.setItem(portalLatestUrlKeyForChannel(channel), url);
      } catch {
        // ignore
      }

      try {
        const bundle = await loadPortalBundle(url);
        applyBundleToState({
          latestUrl: bundle.latestUrl,
          latest: bundle.latest,
          manifestUrl: bundle.manifestUrl,
          manifest: bundle.manifest,
          model: bundle.model,
          indexes: bundle.indexes,
          loadedFromCache: bundle.loadedFromCache,
          indexesDerived: bundle.indexesDerived
        });
        setStatus('ready');
      } catch (e: unknown) {
        setStatus('error');
        setError(formatPortalError(e) || 'Failed to load portal dataset');
      }
    },
    [applyBundleToState, latestUrl, channel]
  );

  const checkForUpdate = useCallback(async () => {
    const url = latestUrl?.trim();
    if (!url) return { updateAvailable: false };

    setUpdateInfo((prev) => (prev.state === 'available' ? prev : { state: 'checking' }));

    try {
      const { updateAvailable, latest } = await checkPortalForUpdate(url, datasetMeta?.bundleId);

      if (datasetMeta?.bundleId && updateAvailable && latest) {
        setUpdateInfo({
          state: 'available',
          currentBundleId: datasetMeta.bundleId,
          latestBundleId: latest.bundleId,
          latestTitle: latest.title
        });
      } else {
        setUpdateInfo({ state: 'none' });
      }

      return { updateAvailable, latest };
    } catch (e: unknown) {
      setUpdateInfo({ state: 'error', message: formatPortalError(e) || 'Failed to check for updates' });
      return { updateAvailable: false };
    }
  }, [datasetMeta?.bundleId, latestUrl]);

  const applyUpdate = useCallback(async () => {
    if (!latestUrl) return;
    await load(latestUrl);
  }, [latestUrl, load]);

  const clearCache = useCallback(async () => {
    const url = latestUrl?.trim();
    if (!url) return;
    await clearCacheForLatestUrl(url);
  }, [latestUrl]);

  // Auto-load when latestUrl becomes available / changes
  useEffect(() => {
    if (!latestUrl) return;
    void load(latestUrl);
  }, [latestUrl, load]);

  const value = useMemo<PortalStoreState>(
    () => ({
      latest: { channel, channelSource, latestUrl, latestUrlSource },
      status,
      error,
      datasetMeta,
      model,
      indexes,
      rootFolderId,
      updateInfo,
      setChannel,
      setLatestUrl,
      load,
      checkForUpdate,
      applyUpdate,
      clearCache
    }),
    [channel, channelSource, datasetMeta, error, indexes, rootFolderId, latestUrl, latestUrlSource, model, status, updateInfo, load, checkForUpdate, applyUpdate, clearCache]
  );

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore(): PortalStoreState {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error('usePortalStore must be used within PortalStoreProvider');
  return ctx;
}
