import { PORTAL_FETCH_TIMEOUT_MS, PORTAL_MAX_BYTES } from './portalLimits';

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
  source?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  hashes?: Record<string, unknown>;
  entrypoints: {
    model: string;
    indexes: string;
  };
};

export type PortalFetchErrorKind = 'http' | 'network' | 'cors' | 'timeout' | 'size' | 'parse' | 'schema';

export class PortalFetchError extends Error {
  kind: PortalFetchErrorKind;
  url: string;
  status?: number;
  details?: string;

  constructor(args: { kind: PortalFetchErrorKind; url: string; message: string; status?: number; details?: string }) {
    super(args.message);
    this.name = 'PortalFetchError';
    this.kind = args.kind;
    this.url = args.url;
    this.status = args.status;
    this.details = args.details;
  }
}

function isProbablyCorsError(err: unknown): boolean {
  // Browsers typically throw TypeError('Failed to fetch') for CORS blocks and some network failures.
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('cors');
}

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}


export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, { cache: 'no-cache', ...(init ?? {}) });
  if (!resp.ok) {
    throw new PortalFetchError({ kind: 'http', url, status: resp.status, message: `HTTP ${resp.status} while fetching ${url}` });
  }
  try {
    return (await resp.json()) as T;
  } catch (e: unknown) {
    const details = e instanceof Error ? e.message : String(e);
    throw new PortalFetchError({ kind: 'parse', url, message: `Failed to parse JSON from ${url}`, details });
  }
}

async function readTextWithLimit(resp: Response, url: string, maxBytes: number): Promise<string> {
  const cl = resp.headers.get('content-length');
  const contentLength = cl ? Number(cl) : NaN;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PortalFetchError({
      kind: 'size',
      url,
      message: `File is too large: ${contentLength} bytes (limit ${maxBytes})`,
      details: `content-length=${cl}`
    });
  }

  // Prefer streaming to enforce limit even when content-length is missing.
  const body = resp.body;
  if (body) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        const u8 = value;
        total += u8.byteLength;
        if (total > maxBytes) {
          try {
            reader.cancel();
          } catch {
            // ignore
          }
          throw new PortalFetchError({ kind: 'size', url, message: `File is too large (limit ${maxBytes} bytes).` });
        }
        chunks.push(u8);
      }
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder('utf-8').decode(merged);
  }

  const text = await resp.text();
  // Approx byte size in UTF-8 by encoding.
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > maxBytes) {
    throw new PortalFetchError({ kind: 'size', url, message: `File is too large (limit ${maxBytes} bytes).` });
  }
  return text;
}

export async function fetchJsonWithLimit<T = unknown>(
  url: string,
  opts: { maxBytes: number; timeoutMs?: number; init?: RequestInit; label?: string }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? PORTAL_FETCH_TIMEOUT_MS;
  const t = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    let resp: Response;
    try {
      resp = await fetch(url, {
        cache: 'no-cache',
        ...(opts.init ?? {}),
        signal: controller.signal
      });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new PortalFetchError({ kind: 'timeout', url, message: `Timed out while fetching ${url}` });
      }
      if (isProbablyCorsError(e)) {
        throw new PortalFetchError({
          kind: 'cors',
          url,
          message: `Could not fetch ${opts.label ?? 'resource'} (CORS/network blocked).`,
          details: e instanceof Error ? e.message : String(e)
        });
      }
      throw new PortalFetchError({ kind: 'network', url, message: `Network error while fetching ${url}`, details: e instanceof Error ? e.message : String(e) });
    }

    if (!resp.ok) {
      throw new PortalFetchError({ kind: 'http', url, status: resp.status, message: `HTTP ${resp.status} while fetching ${url}` });
    }

    const text = await readTextWithLimit(resp, url, opts.maxBytes);
    try {
      return JSON.parse(text) as T;
    } catch (e: unknown) {
      const details = e instanceof Error ? e.message : String(e);
      throw new PortalFetchError({ kind: 'parse', url, message: `Failed to parse JSON from ${url}`, details });
    }
  } finally {
    window.clearTimeout(t);
  }
}

export function resolveRelative(baseUrl: string, relativePath: string): string {
  try {
    return new URL(relativePath, baseUrl).toString();
  } catch {
    return relativePath;
  }
}

export async function fetchLatest(latestUrl: string): Promise<LatestPointer> {
  const json = await fetchJsonWithLimit<unknown>(latestUrl, {
    maxBytes: PORTAL_MAX_BYTES.latestJson,
    timeoutMs: PORTAL_FETCH_TIMEOUT_MS,
    label: 'latest.json'
  });
  const obj = (json && typeof json === 'object') ? (json as Record<string, unknown>) : null;
  const bundleId = normalizeString(obj?.bundleId);
  const manifestUrl = normalizeString(obj?.manifestUrl);
  if (!bundleId || !manifestUrl) {
    throw new PortalFetchError({ kind: 'schema', url: latestUrl, message: 'latest.json schema is invalid. Expected { bundleId: string, manifestUrl: string }.' });
  }
  const title = normalizeString(obj?.title) ?? undefined;
  const channel = normalizeString(obj?.channel) ?? undefined;
  const environment = normalizeString(obj?.environment) ?? undefined;
  return { bundleId, manifestUrl, title, channel, environment };
}

export async function fetchManifest(manifestUrl: string): Promise<PublishManifest> {
  const json = await fetchJsonWithLimit<unknown>(manifestUrl, {
    maxBytes: PORTAL_MAX_BYTES.manifestJson,
    timeoutMs: PORTAL_FETCH_TIMEOUT_MS,
    label: 'manifest.json'
  });
  const obj = (json && typeof json === 'object') ? (json as Record<string, unknown>) : null;
  const entrypoints = (obj?.entrypoints && typeof obj.entrypoints === 'object') ? (obj.entrypoints as Record<string, unknown>) : null;
  const bundleId = normalizeString(obj?.bundleId);
  const modelEp = normalizeString(entrypoints?.model);
  const indexesEp = normalizeString(entrypoints?.indexes);
  if (!bundleId || !modelEp || !indexesEp) {
    throw new PortalFetchError({
      kind: 'schema',
      url: manifestUrl,
      message: 'manifest.json schema is invalid. Expected { bundleId, entrypoints: { model, indexes } }.'
    });
  }
  return {
    schemaVersion: typeof obj?.schemaVersion === 'number' ? (obj.schemaVersion as number) : undefined,
    bundleId,
    createdAt: normalizeString(obj?.createdAt) ?? undefined,
    source: (obj?.source && typeof obj.source === 'object') ? (obj.source as Record<string, unknown>) : undefined,
    counts: (obj?.counts && typeof obj.counts === 'object') ? (obj.counts as Record<string, unknown>) : undefined,
    hashes: (obj?.hashes && typeof obj.hashes === 'object') ? (obj.hashes as Record<string, unknown>) : undefined,
    entrypoints: { model: modelEp, indexes: indexesEp }
  };
}
