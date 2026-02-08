export type PortalLatestUrlResolution = {
  latestUrl: string;
  source: 'query' | 'localStorage' | 'publicConfig' | 'fallback';
};

export const PORTAL_LATEST_URL_LOCALSTORAGE_KEY = 'portal.latestUrl';

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function readQueryLatestUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeUrl(params.get('bundleUrl') || params.get('latestUrl'));
  } catch {
    return null;
  }
}

function readLocalStorageLatestUrl(): string | null {
  try {
    return normalizeUrl(window.localStorage.getItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY));
  } catch {
    return null;
  }
}

async function readPublicConfigLatestUrl(): Promise<string | null> {
  try {
    const res = await fetch('/config.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== 'object') return null;
    const portal = (json as { portal?: unknown }).portal;
    if (!portal || typeof portal !== 'object') return null;
    const latestUrl = (portal as { latestUrl?: unknown }).latestUrl;
    return normalizeUrl(latestUrl);
  } catch {
    return null;
  }
}

export function persistPortalLatestUrl(latestUrl: string | null) {
  try {
    if (!latestUrl) window.localStorage.removeItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY);
    else window.localStorage.setItem(PORTAL_LATEST_URL_LOCALSTORAGE_KEY, latestUrl);
  } catch {
    // ignore
  }
}

export async function resolvePortalLatestUrl(): Promise<PortalLatestUrlResolution> {
  const fromQuery = readQueryLatestUrl();
  if (fromQuery) {
    persistPortalLatestUrl(fromQuery);
    return { latestUrl: fromQuery, source: 'query' };
  }

  const fromLocal = readLocalStorageLatestUrl();
  if (fromLocal) return { latestUrl: fromLocal, source: 'localStorage' };

  const fromConfig = await readPublicConfigLatestUrl();
  if (fromConfig) {
    // Persist so future reloads do not depend on the host config.
    persistPortalLatestUrl(fromConfig);
    return { latestUrl: fromConfig, source: 'publicConfig' };
  }

  // Final fallback: same-origin latest.json.
  return { latestUrl: '/latest.json', source: 'fallback' };
}
