import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type PortalDatasetMeta = {
  title?: string;
  bundleId?: string;
};

export type PortalLatestUrlSource = 'query' | 'localStorage' | 'publicConfig' | 'fallback';

const PORTAL_LATEST_URL_LOCALSTORAGE_KEY = 'portal.latestUrl';

export type PortalLatestUrlState = {
  /** The configured URL to `latest.json` (may be null until resolved). */
  latestUrl: string | null;
  /** How the URL was resolved (query param, localStorage, or public config). */
  latestUrlSource: PortalLatestUrlSource | null;
};

export type PortalStoreState = {
  latest: PortalLatestUrlState;
  datasetMeta: PortalDatasetMeta | null;
  // Loader + cache will be added in Step 3.
  setLatestUrl: (latestUrl: string | null, source?: PortalLatestUrlSource) => void;
  setDatasetMeta: (meta: PortalDatasetMeta | null) => void;
};

const PortalStoreContext = createContext<PortalStoreState | null>(null);

export function PortalStoreProvider({ children }: { children: ReactNode }) {
  const [latestUrl, setLatestUrlState] = useState<string | null>(null);
  const [latestUrlSource, setLatestUrlSource] = useState<PortalLatestUrlSource | null>(null);
  const [datasetMeta, setDatasetMeta] = useState<PortalDatasetMeta | null>(null);

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

  const value = useMemo<PortalStoreState>(
    () => ({
      latest: { latestUrl, latestUrlSource },
      datasetMeta,
      setLatestUrl,
      setDatasetMeta
    }),
    [datasetMeta, latestUrl, latestUrlSource]
  );

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore() {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error('usePortalStore must be used within PortalStoreProvider');
  return ctx;
}
