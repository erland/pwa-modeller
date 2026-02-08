export type LatestPointer = {
  bundleId: string;
  manifestUrl: string;
  title?: string;
  channel?: string;
  environment?: string;
};

export type PublishManifest = {
  schemaVersion?: number;
  bundleId: string;
  createdAt?: string;
  source?: any;
  counts?: any;
  hashes?: any;
  entrypoints: {
    model: string;
    indexes: string;
  };
};

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, { cache: 'no-cache', ...(init ?? {}) });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} while fetching ${url}`);
  }
  return (await resp.json()) as T;
}

export function resolveRelative(baseUrl: string, relativePath: string): string {
  try {
    return new URL(relativePath, baseUrl).toString();
  } catch {
    return relativePath;
  }
}

export async function fetchLatest(latestUrl: string): Promise<LatestPointer> {
  const json = await fetchJson<any>(latestUrl);
  const bundleId = normalizeString(json?.bundleId);
  const manifestUrl = normalizeString(json?.manifestUrl);
  if (!bundleId || !manifestUrl) {
    throw new Error('latest.json schema is invalid. Expected { bundleId: string, manifestUrl: string }.');
  }
  const title = normalizeString(json?.title) ?? undefined;
  const channel = normalizeString(json?.channel) ?? undefined;
  const environment = normalizeString(json?.environment) ?? undefined;
  return { bundleId, manifestUrl, title, channel, environment };
}

export async function fetchManifest(manifestUrl: string): Promise<PublishManifest> {
  const json = await fetchJson<any>(manifestUrl);
  const bundleId = normalizeString(json?.bundleId);
  const modelEp = normalizeString(json?.entrypoints?.model);
  const indexesEp = normalizeString(json?.entrypoints?.indexes);
  if (!bundleId || !modelEp || !indexesEp) {
    throw new Error('manifest.json schema is invalid. Expected { bundleId, entrypoints: { model, indexes } }.');
  }
  return {
    schemaVersion: typeof json?.schemaVersion === 'number' ? json.schemaVersion : undefined,
    bundleId,
    createdAt: normalizeString(json?.createdAt) ?? undefined,
    source: json?.source,
    counts: json?.counts,
    hashes: json?.hashes,
    entrypoints: { model: modelEp, indexes: indexesEp }
  };
}
