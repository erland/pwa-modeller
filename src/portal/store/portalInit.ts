import {
  readQueryParams,
  resolveLatestUrlFromConfig,
  tryReadPublicPortalConfig,
  normalizeString,
  type PortalChannelSource,
  type PortalLatestUrlSource
} from './portalConfig';
import { PORTAL_CHANNEL_LOCALSTORAGE_KEY, PORTAL_LATEST_URL_LEGACY_KEY, portalLatestUrlKeyForChannel } from './portalLocalStorage';

export type ResolvedPortalStartup = {
  channel: string;
  channelSource: PortalChannelSource;
  latestUrl: string;
  latestUrlSource: PortalLatestUrlSource;
};

/**
 * Resolve the initial portal channel + latestUrl using the precedence rules:
 * - query param
 * - localStorage
 * - public config
 * - fallback
 */
export async function resolvePortalStartup(): Promise<ResolvedPortalStartup> {
  const { bundleUrl, channel: channelFromQuery } = readQueryParams();
  const cfg = await tryReadPublicPortalConfig();

  // 1) Channel: query param
  let resolvedChannel = normalizeString(channelFromQuery);
  let resolvedChannelSource: PortalChannelSource = 'fallback';

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
  let resolvedLatestUrlSource: PortalLatestUrlSource = 'fallback';

  if (bundleUrl) {
    resolvedLatestUrl = bundleUrl;
    resolvedLatestUrlSource = 'query';

    // If query specifies a bundleUrl, persist into active channel so reload works.
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

  return {
    channel: resolvedChannel,
    channelSource: resolvedChannelSource,
    latestUrl: resolvedLatestUrl,
    latestUrlSource: resolvedLatestUrlSource
  };
}