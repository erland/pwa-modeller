import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../domain';
import { buildPortalIndexes, isPortalIndexes, type PortalIndexes } from '../indexes/portalIndexes';
import { clearCacheForLatestUrl, getCachedBundle, getMostRecentCachedBundle, putCachedBundle } from '../data/portalCache';
import { fetchJsonWithLimit, fetchLatest, fetchManifest, resolveRelative, PortalFetchError, type LatestPointer, type PublishManifest } from '../data/portalDataset';
import { PORTAL_MAX_BYTES, formatBytes } from '../data/portalLimits';

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
  indexes: PortalIndexes | null;

  setLatestUrl: (latestUrl: string | null, source?: PortalLatestUrlSource) => void;

  load: (latestUrl?: string) => Promise<void>;
  checkForUpdate: () => Promise<{ updateAvailable: boolean; latest?: LatestPointer }>;
  clearCache: () => Promise<void>;
};

function isModelLike(v: any): v is Model {
  return Boolean(v && typeof v === 'object' && typeof v.elements === 'object' && typeof v.relationships === 'object' && typeof v.views === 'object');
}

function formatPortalError(e: any): string {
  if (e instanceof PortalFetchError) {
    const base = e.message;
    const details = e.details ? `\nDetails: ${e.details}` : '';

    if (e.kind === 'cors') {
      return (
        `${base}` +
        `\nHint: This often means CORS is blocking cross-origin reads.` +
        ` Ensure the host serves the files with an Access-Control-Allow-Origin header` +
        ` (or host the bundle on the same origin as the portal).` +
        details
      );
    }

    if (e.kind === 'http') {
      return `${base}\nHint: Verify the URL is correct and the file is publicly accessible.${details}`;
    }

    if (e.kind === 'parse') {
      return `${base}\nHint: The server may be returning HTML (e.g., an error page) instead of JSON.${details}`;
    }

    if (e.kind === 'size') {
      return (
        `${base}` +
        `\nHint: Portal limits are: model ≤ ${formatBytes(PORTAL_MAX_BYTES.modelJson)}, indexes ≤ ${formatBytes(PORTAL_MAX_BYTES.indexesJson)}.` +
        ` You can tune these in src/portal/data/portalLimits.ts.`
      );
    }

    if (e.kind === 'schema') {
      return `${base}\nHint: The published files do not match the expected bundle format.`;
    }

    if (e.kind === 'timeout') {
      return `${base}\nHint: The host might be slow. Try again or use a faster/static host.`;
    }

    return `${base}${details}`;
  }

  return e?.message ? String(e.message) : String(e);
}

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
            loadedFromCache: true,
            indexesDerived: false
          });
          setStatus('ready');
          return;
        }

        setStatus('error');
        setError(formatPortalError(e) || 'Failed to fetch latest.json');
        return;
      }

      const manifestUrl = resolveRelative(url, latest.manifestUrl);

      // 2) Fetch manifest and entrypoints
      try {
        const manifest = await fetchManifest(manifestUrl);
        const modelUrl = resolveRelative(manifestUrl, manifest.entrypoints.model);
        const indexesUrl = resolveRelative(manifestUrl, manifest.entrypoints.indexes);

        const [modelJson, indexesJson] = await Promise.all([
          fetchJsonWithLimit<any>(modelUrl, { maxBytes: PORTAL_MAX_BYTES.modelJson, label: 'model.json' }),
          fetchJsonWithLimit<any>(indexesUrl, { maxBytes: PORTAL_MAX_BYTES.indexesJson, label: 'indexes.json' })
        ]);

        if (!isModelLike(modelJson)) {
          throw new PortalFetchError({ kind: 'schema', url: modelUrl, message: 'model.json schema is invalid. Expected an object with { elements, relationships, views }.' });
        }

        const typedModel = modelJson as Model;
        let typedIndexes: PortalIndexes;
        let indexesDerived = false;
        if (isPortalIndexes(indexesJson)) {
          typedIndexes = indexesJson as PortalIndexes;
        } else {
          // Derive indexes if they are missing or invalid, but never let this crash the portal.
          try {
            typedIndexes = buildPortalIndexes(typedModel);
            indexesDerived = true;
          } catch (err: any) {
            throw new PortalFetchError({ kind: 'schema', url: indexesUrl, message: 'indexes.json is invalid and could not be derived from model.json.', details: err?.message ? String(err.message) : String(err) });
          }
        }


        await putCachedBundle({
          latestUrl: url,
          bundleId: latest.bundleId,
          latest,
          manifestUrl,
          manifest,
          model: typedModel,
          indexes: typedIndexes
        });

        applyBundleToState({
          latestUrl: url,
          latest,
          manifestUrl,
          manifest,
          model: typedModel,
          indexes: typedIndexes,
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
            loadedFromCache: true,
            indexesDerived: false
          });
          setStatus('ready');
          return;
        }

        setStatus('error');
        setError(formatPortalError(e) || 'Failed to load published bundle');
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
