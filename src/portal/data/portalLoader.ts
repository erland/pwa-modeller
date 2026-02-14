import type { Model } from '../../domain';

import { buildPortalIndexes, isPortalIndexes, type PortalIndexes } from '../indexes/portalIndexes';
import { getCachedBundle, getMostRecentCachedBundle, putCachedBundle } from './portalCache';
import {
  fetchJsonWithLimit,
  fetchLatest,
  fetchManifest,
  resolveRelative,
  PortalFetchError,
  type LatestPointer,
  type PublishManifest
} from './portalDataset';
import { PORTAL_MAX_BYTES } from './portalLimits';
import { isModelLike } from '../store/portalErrors';

export type LoadedPortalBundle = {
  latestUrl: string;
  latest: LatestPointer;
  manifestUrl: string;
  manifest: PublishManifest;
  model: Model;
  indexes: PortalIndexes;
  loadedFromCache: boolean;
  indexesDerived: boolean;
};

/**
 * Load a published portal bundle from the provided latestUrl.
 *
 * - Fetches latest.json → manifest.json → model.json + indexes.json
 * - Validates shape, derives indexes if missing/invalid
 * - Caches the bundle, and falls back to cached versions when offline
 */
export async function loadPortalBundle(latestUrl: string): Promise<LoadedPortalBundle> {
  const url = latestUrl.trim();
  if (!url) {
    throw new PortalFetchError({ kind: 'schema', url: latestUrl, message: 'latestUrl is empty' });
  }

  // 1) Fetch latest pointer
  let latest: LatestPointer;
  try {
    latest = await fetchLatest(url);
  } catch (e: unknown) {
    // Offline path: fall back to most recent cached bundle for this latestUrl
    const cached = await getMostRecentCachedBundle(url);
    if (cached) {
      return {
        latestUrl: url,
        latest: cached.latest,
        manifestUrl: cached.manifestUrl,
        manifest: cached.manifest,
        model: cached.model,
        indexes: cached.indexes,
        loadedFromCache: true,
        indexesDerived: false
      };
    }
    throw e;
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
      throw new PortalFetchError({
        kind: 'schema',
        url: modelUrl,
        message: 'model.json schema is invalid. Expected an object with { elements, relationships, views }.'
      });
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

    return {
      latestUrl: url,
      latest,
      manifestUrl,
      manifest,
      model: typedModel,
      indexes: typedIndexes,
      loadedFromCache: false,
      indexesDerived
    };
  } catch (e: unknown) {
    // Fallback: use cached bundle for *this* bundleId if present
    const cached = await getCachedBundle(url, latest.bundleId);
    if (cached) {
      return {
        latestUrl: url,
        latest: cached.latest,
        manifestUrl: cached.manifestUrl,
        manifest: cached.manifest,
        model: cached.model,
        indexes: cached.indexes,
        loadedFromCache: true,
        indexesDerived: false
      };
    }
    throw e;
  }
}
