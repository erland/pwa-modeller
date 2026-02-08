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
  indexesDerived?: boolean;
};

export type PortalLatestUrlSource = 'query' | 'localStorage' | 'publicConfig' | 'fallback';
export type PortalChannelSource = 'query' | 'localStorage' | 'publicConfig' | 'fallback';

export type PortalLatestUrlState = {
  /** The active channel (prod/test/demo/custom/other). */
  channel: string;
  channelSource: PortalChannelSource | null;

  /** The configured URL to `latest.json` (may be null until resolved). */
  latestUrl: string | null;
  /** How the URL was resolved (query param, localStorage, or public config). */
  latestUrlSource: PortalLatestUrlSource | null;
};

export type PortalLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type PortalUpdateInfo =
  | { state: 'none' }
  | { state: 'checking' }
  | { state: 'available'; currentBundleId: string; latestBundleId: string; latestTitle?: string }
  | { state: 'error'; message: string };

const PORTAL_CHANNEL_LOCALSTORAGE_KEY = 'portal.channel';
const PORTAL_LATEST_URL_LEGACY_KEY = 'portal.latestUrl';
const portalLatestUrlKeyForChannel = (channel: string) => `portal.latestUrl.${channel}`;

export type PortalStoreState = {
  latest: PortalLatestUrlState;

  status: PortalLoadStatus;
  error: string | null;

  datasetMeta: PortalDatasetMeta | null;
  model: Model | null;
  indexes: PortalIndexes | null;

  updateInfo: PortalUpdateInfo;

  setChannel: (channel: string, source?: PortalChannelSource) => void;
  setLatestUrl: (latestUrl: string | null, source?: PortalLatestUrlSource) => void;

  load: (latestUrl?: string) => Promise<void>;
  checkForUpdate: () => Promise<{ updateAvailable: boolean; latest?: LatestPointer }>;
  applyUpdate: () => Promise<void>;
  clearCache: () => Promise<void>;
};

function isModelLike(v: unknown): v is Model {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['elements'] === 'object' &&
    o['elements'] !== null &&
    typeof o['relationships'] === 'object' &&
    o['relationships'] !== null &&
    typeof o['views'] === 'object' &&
    o['views'] !== null
  );
}

function formatPortalError(e: unknown): string {
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

  return e instanceof Error ? e.message : String(e);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

type PortalPublicConfig = {
  portal?: {
    defaultChannel?: string;
    latestUrl?: string;
    channels?: Record<string, { latestUrl?: string }>;
  };
};

async function tryReadPublicPortalConfig(): Promise<PortalPublicConfig | null> {
  try {
    const resp = await fetch('/config.json', { cache: 'no-cache' });
    if (!resp.ok) return null;
    const json = (await resp.json()) as unknown;
    if (!json || typeof json !== 'object') return null;
    return json as PortalPublicConfig;
  } catch {
    return null;
  }
}

function readQueryParams(): { bundleUrl?: string; channel?: string } {
  try {
    // With hash-based routing, query params may live inside location.hash (e.g. "#/portal?latestUrl=…&channel=test").
    const candidates: string[] = [];
    if (typeof window.location.search === 'string' && window.location.search.length > 1) candidates.push(window.location.search);
    if (typeof window.location.hash === 'string') {
      const idx = window.location.hash.indexOf('?');
      if (idx >= 0) candidates.push(window.location.hash.slice(idx + 1));
    }

    for (const q of candidates) {
      const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
      const bundleUrl = normalizeString(params.get('bundleUrl') || params.get('latestUrl')) ?? undefined;
      const channel = normalizeString(params.get('channel')) ?? undefined;
      if (bundleUrl || channel) return { bundleUrl, channel };
    }

    return {};
  } catch {
    return {};
  }
}

function resolveLatestUrlFromConfig(cfg: PortalPublicConfig, channel: string): string | null {
  // Backwards compatible:
  // - cfg.portal.latestUrl
  // - cfg.portal.channels[<channel>].latestUrl
  const direct = normalizeString(cfg.portal?.latestUrl);
  const channelUrl = normalizeString(cfg.portal?.channels?.[channel]?.latestUrl);
  return channelUrl ?? direct ?? null;
}

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

  const [updateInfo, setUpdateInfo] = useState<PortalUpdateInfo>({ state: 'none' });

  // Step 2/10: resolve channel + latestUrl on startup
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { bundleUrl, channel: channelFromQuery } = readQueryParams();
      const cfg = await tryReadPublicPortalConfig();

      // 1) Channel: query param
      let resolvedChannel = normalizeString(channelFromQuery);
      let resolvedChannelSource: PortalChannelSource | null = null;

      if (resolvedChannel) {
        resolvedChannelSource = 'query';
        try {
          window.localStorage.setItem(PORTAL_CHANNEL_LOCALSTORAGE_KEY, resolvedChannel);
        } catch {
          // ignore
        }
      }

      // 2) Channel: localStorage
      if (!resolvedChannel) {
        try {
          resolvedChannel = normalizeString(window.localStorage.getItem(PORTAL_CHANNEL_LOCALSTORAGE_KEY));
          if (resolvedChannel) resolvedChannelSource = 'localStorage';
        } catch {
          // ignore
        }
      }

      // 3) Channel: public config
      if (!resolvedChannel) {
        const cfgDefaultChannel = normalizeString(cfg?.portal?.defaultChannel);
        if (cfgDefaultChannel) {
          resolvedChannel = cfgDefaultChannel;
          resolvedChannelSource = 'publicConfig';
        }
      }

      // Fallback channel
      if (!resolvedChannel) {
        resolvedChannel = 'prod';
        resolvedChannelSource = 'fallback';
      }

      // Latest URL resolution precedence:
      // 1) Query param bundleUrl/latestUrl (always wins)
      // 2) localStorage portal.latestUrl.<channel> (or legacy portal.latestUrl)
      // 3) public/config.json default (optionally per channel)
      // 4) fallback /latest.json
      let resolvedLatestUrl: string | null = null;
      let resolvedLatestUrlSource: PortalLatestUrlSource | null = null;

      if (bundleUrl) {
        resolvedLatestUrl = bundleUrl;
        resolvedLatestUrlSource = 'query';

        // If query specifies a bundleUrl, treat it as "custom" unless user explicitly chose a channel.
        // But we still persist the URL into the active channel so reloading works.
        try {
          window.localStorage.setItem(PORTAL_LATEST_URL_LEGACY_KEY, resolvedLatestUrl);
          window.localStorage.setItem(portalLatestUrlKeyForChannel(resolvedChannel), resolvedLatestUrl);
        } catch {
          // ignore
        }
      }

      // localStorage per channel
      if (!resolvedLatestUrl) {
        try {
          const perChannel = normalizeString(window.localStorage.getItem(portalLatestUrlKeyForChannel(resolvedChannel)));
          if (perChannel) {
            resolvedLatestUrl = perChannel;
            resolvedLatestUrlSource = 'localStorage';
          } else {
            const legacy = normalizeString(window.localStorage.getItem(PORTAL_LATEST_URL_LEGACY_KEY));
            if (legacy) {
              resolvedLatestUrl = legacy;
              resolvedLatestUrlSource = 'localStorage';
            }
          }
        } catch {
          // ignore
        }
      }

      // public config (per channel or direct)
      if (!resolvedLatestUrl && cfg) {
        const cfgUrl = resolveLatestUrlFromConfig(cfg, resolvedChannel);
        if (cfgUrl) {
          resolvedLatestUrl = cfgUrl;
          resolvedLatestUrlSource = 'publicConfig';
          try {
            window.localStorage.setItem(PORTAL_LATEST_URL_LEGACY_KEY, resolvedLatestUrl);
            window.localStorage.setItem(portalLatestUrlKeyForChannel(resolvedChannel), resolvedLatestUrl);
          } catch {
            // ignore
          }
        }
      }

      // fallback
      if (!resolvedLatestUrl) {
        resolvedLatestUrl = '/latest.json';
        resolvedLatestUrlSource = 'fallback';
      }

      if (!isMounted) return;
      setChannelState(resolvedChannel);
      setChannelSource(resolvedChannelSource);
      setLatestUrlState(resolvedLatestUrl);
      setLatestUrlSource(resolvedLatestUrlSource);
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

      // 1) Fetch latest pointer
      let latest: LatestPointer | null = null;
      try {
        latest = await fetchLatest(url);
      } catch (e: unknown) {
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
          fetchJsonWithLimit<unknown>(modelUrl, { maxBytes: PORTAL_MAX_BYTES.modelJson, label: 'model.json' }),
          fetchJsonWithLimit<unknown>(indexesUrl, { maxBytes: PORTAL_MAX_BYTES.indexesJson, label: 'indexes.json' })
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
          } catch (err: unknown) {
            throw new PortalFetchError({
              kind: 'schema',
              url: indexesUrl,
              message: 'indexes.json is invalid and could not be derived from model.json.',
              details: err instanceof Error ? err.message : String(err)
            });
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
          loadedFromCache: false,
          indexesDerived
        });

        setStatus('ready');
      } catch (e: unknown) {
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
    [applyBundleToState, latestUrl, channel]
  );

  const checkForUpdate = useCallback(async () => {
    const url = latestUrl?.trim();
    if (!url) return { updateAvailable: false };

    setUpdateInfo((prev) => (prev.state === 'available' ? prev : { state: 'checking' }));

    try {
      const latest = await fetchLatest(url);
      const updateAvailable = datasetMeta?.bundleId ? latest.bundleId !== datasetMeta.bundleId : true;

      if (datasetMeta?.bundleId && updateAvailable) {
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
      updateInfo,
      setChannel,
      setLatestUrl,
      load,
      checkForUpdate,
      applyUpdate,
      clearCache
    }),
    [channel, channelSource, datasetMeta, error, indexes, latestUrl, latestUrlSource, model, status, updateInfo, load, checkForUpdate, applyUpdate, clearCache]
  );

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore(): PortalStoreState {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error('usePortalStore must be used within PortalStoreProvider');
  return ctx;
}
