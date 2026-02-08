import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../domain';
import { clearCacheForLatestUrl, getCachedBundle, getMostRecentCachedBundle, putCachedBundle } from '../data/portalCache';
import { fetchLatest, fetchManifest, resolveRelative, type LatestPointer, type PublishManifest } from '../data/portalDataset';

export type PortalDatasetMeta = {
  title?: string;
  bundleId: string;
  createdAt?: string;
  schemaVersion?: number;
  latestUrl: string;
  manifestUrl: string;
  loadedFromCache?: boolean;
};

export type PortalLatestUrlSource = 'query' | 'localStorage' | 'publicConfig' | 'fallback';

const PORTAL_LATEST_URL_LOCALSTORAGE_KEY = 'portal.latestUrl';

export type PortalLatestUrlState = {
  /** The configured URL to `latest.json` (may be null until resolved). */
  latestUrl: string | null;
  /** How the URL was resolved (query param, localStorage, or public config). */
  latestUrlSource: PortalLatestUrlSource | null;
};

export type PortalLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type PortalStoreState = {
  latest: PortalLatestUrlState;

  status: PortalLoadStatus;
  error: string | null;

  datasetMeta: PortalDatasetMeta | null;
  model: Model | null;
  indexes: any | null;

  setLatestUrl: (latestUrl: string | null, source?: PortalLatestUrlSource) => void;

  load: (latestUrl?: string) => Promise<void>;
  checkForUpdate: () => Promise<{ updateAvailable: boolean; latest?: LatestPointer }>;
  clearCache: () => Promise<void>;
};

const PortalStoreContext = createContext<PortalStoreState | null>(null);

export function PortalStoreProvider({ children }: { children: ReactNode }) {
  const [latestUrl, setLatestUrlState] = useState<string | null>(null);
  const [latestUrlSource, setLatestUrlSource] = useState<PortalLatestUrlSource | null>(null);

  const [status, setStatus] = useState<PortalLoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const [datasetMeta, setDatasetMeta] = useState<PortalDatasetMeta | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [indexes, setIndexes] = useState<any | null>(null);

  // Step 2: resolve latestUrl on startup
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const normalize = (v: unknown): string | null => {
        if (typeof v !== 'string') return null;
        const s = v.trim();
        return s ? s : null;
      };

      // 1) Query param `bundleUrl` (or `latestUrl`)
      let resolvedUrl = (() => {
        try {
          const params = new URLSearchParams(window.location.search);
          return normalize(params.get('bundleUrl') || params.get('latestUrl'));
        } catch {
          return null;
        }
      })();
      let source: PortalLatestUrlSource | null = null;

      if (resolvedUrl) {
        source = 'query';
        try {
          window.localStorage.setItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY, resolvedUrl);
        } catch {
          // ignore
        }
      }

      // 2) localStorage
      if (!resolvedUrl) {
        try {
          resolvedUrl = normalize(window.localStorage.getItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY));
          if (resolvedUrl) source = 'localStorage';
        } catch {
          // ignore
        }
      }

      // 3) public/config.json default
      if (!resolvedUrl) {
        try {
          const resp = await fetch('/config.json', { cache: 'no-cache' });
          if (resp.ok) {
            const json = (await resp.json()) as any;
            const cfgUrl = normalize(json?.portal?.latestUrl);
            if (cfgUrl) {
              resolvedUrl = cfgUrl;
              source = 'publicConfig';
              try {
                window.localStorage.setItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY, resolvedUrl);
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      }

      // Fallback
      if (!resolvedUrl) {
        resolvedUrl = '/latest.json';
        source = 'fallback';
      }

      if (!isMounted) return;
      setLatestUrlState(resolvedUrl);
      setLatestUrlSource(source);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

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
      loadedFromCache
    }: {
      latestUrl: string;
      latest: LatestPointer;
      manifestUrl: string;
      manifest: PublishManifest;
      model: Model;
      indexes: any;
      loadedFromCache?: boolean;
    }) => {
      setDatasetMeta({
        title: latest.title,
        bundleId: manifest.bundleId,
        createdAt: manifest.createdAt,
        schemaVersion: manifest.schemaVersion,
        latestUrl,
        manifestUrl,
        loadedFromCache
      });
      setModel(model);
      setIndexes(indexes);
    },
    []
  );

  const load = useCallback(
    async (overrideLatestUrl?: string) => {
      const url = (overrideLatestUrl ?? latestUrl)?.trim();
      if (!url) return;

      setStatus('loading');
      setError(null);

      // 1) Fetch latest pointer
      let latest: LatestPointer | null = null;
      try {
        latest = await fetchLatest(url);
      } catch (e: any) {
        // Offline path: fall back to most recent cached bundle for this latestUrl
        const cached = await getMostRecentCachedBundle(url);
        if (cached) {
          applyBundleToState({
            latestUrl: url,
            latest: cached.latest,
            manifestUrl: cached.manifestUrl,
            manifest: cached.manifest,
            model: cached.model,
            indexes: cached.indexes,
            loadedFromCache: true
          });
          setStatus('ready');
          return;
        }

        setStatus('error');
        setError(e?.message ? String(e.message) : 'Failed to fetch latest.json');
        return;
      }

      const manifestUrl = resolveRelative(url, latest.manifestUrl);

      // 2) Fetch manifest and entrypoints
      try {
        const manifest = await fetchManifest(manifestUrl);
        const modelUrl = resolveRelative(manifestUrl, manifest.entrypoints.model);
        const indexesUrl = resolveRelative(manifestUrl, manifest.entrypoints.indexes);

        const [modelJson, indexesJson] = await Promise.all([
          (await fetch(modelUrl, { cache: 'no-cache' })).json(),
          (await fetch(indexesUrl, { cache: 'no-cache' })).json()
        ]);

        const typedModel = modelJson as Model;

        await putCachedBundle({
          latestUrl: url,
          bundleId: latest.bundleId,
          latest,
          manifestUrl,
          manifest,
          model: typedModel,
          indexes: indexesJson
        });

        applyBundleToState({
          latestUrl: url,
          latest,
          manifestUrl,
          manifest,
          model: typedModel,
          indexes: indexesJson,
          loadedFromCache: false
        });

        setStatus('ready');
      } catch (e: any) {
        // Fallback: use cached bundle for *this* bundleId if present
        const cached = await getCachedBundle(url, latest.bundleId);
        if (cached) {
          applyBundleToState({
            latestUrl: url,
            latest: cached.latest,
            manifestUrl: cached.manifestUrl,
            manifest: cached.manifest,
            model: cached.model,
            indexes: cached.indexes,
            loadedFromCache: true
          });
          setStatus('ready');
          return;
        }

        setStatus('error');
        setError(e?.message ? String(e.message) : 'Failed to load published bundle');
      }
    },
    [applyBundleToState, latestUrl]
  );

  const checkForUpdate = useCallback(async () => {
    const url = latestUrl?.trim();
    if (!url) return { updateAvailable: false };

    try {
      const latest = await fetchLatest(url);
      const updateAvailable = datasetMeta?.bundleId ? latest.bundleId !== datasetMeta.bundleId : true;
      return { updateAvailable, latest };
    } catch {
      return { updateAvailable: false };
    }
  }, [datasetMeta?.bundleId, latestUrl]);

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
      latest: { latestUrl, latestUrlSource },
      status,
      error,
      datasetMeta,
      model,
      indexes,
      setLatestUrl,
      load,
      checkForUpdate,
      clearCache
    }),
    [datasetMeta, error, indexes, latestUrl, latestUrlSource, load, model, status, checkForUpdate, clearCache]
  );

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore() {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error('usePortalStore must be used within PortalStoreProvider');
  return ctx;
}
