export type PortalLatestUrlSource = 'query' | 'localStorage' | 'publicConfig' | 'fallback';
export type PortalChannelSource = 'query' | 'localStorage' | 'publicConfig' | 'fallback';

export type PortalLatestUrlState = {
  channel: string;
  channelSource: PortalChannelSource | null;
  latestUrl: string | null;
  latestUrlSource: PortalLatestUrlSource | null;
};

export function normalizeString(value: unknown): string | null {
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

export async function tryReadPublicPortalConfig(): Promise<PortalPublicConfig | null> {
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

export function readQueryParams(): { bundleUrl?: string; channel?: string } {
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

export function resolveLatestUrlFromConfig(cfg: PortalPublicConfig, channel: string): string | null {
  const direct = normalizeString(cfg.portal?.latestUrl);
  const channelUrl = normalizeString(cfg.portal?.channels?.[channel]?.latestUrl);
  return channelUrl ?? direct ?? null;
}
