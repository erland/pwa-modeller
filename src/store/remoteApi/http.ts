import { loadRemoteDatasetSettings } from '../remoteDatasetSettings';
import { getAccessToken } from '../../auth/oidcPkceAuth';
import { RemoteDatasetApiError } from './types';

export type CommonArgs = { baseUrl?: string; token?: string | null };

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function requireAccessToken(): Promise<string> {
  // Prefer PKCE session tokens.
  const t = await getAccessToken();
  if (t) return t;
  // Back-compat: allow legacy token saved in settings.
  const settings = loadRemoteDatasetSettings();
  if (settings.remoteAccessToken) return settings.remoteAccessToken;
  throw new Error('Not signed in (no access token)');
}

export function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Resolve baseUrl and token with the same logic that the legacy remoteDatasetApi.ts used.
 * - baseUrl: from explicit args or persisted remote settings
 * - token: from explicit args, otherwise PKCE session, otherwise legacy persisted token
 */
export async function resolveCommon(args?: CommonArgs): Promise<{ baseUrl: string; token: string }> {
  const settings = loadRemoteDatasetSettings();
  const baseUrl = normalizeBaseUrl(args?.baseUrl ?? settings.remoteServerBaseUrl ?? '');
  if (!baseUrl) throw new Error('Remote server baseUrl is not set');

  const token = typeof args?.token === 'undefined' ? await requireAccessToken() : args.token;
  if (!token) throw new Error('Not signed in (no access token)');

  return { baseUrl, token };
}

export async function requestJson<T>(args: {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token: string;
  headers?: HeadersInit;
  body?: unknown;
}): Promise<{ data: T; etag: string | null }> {
  let res: Response;
  try {
    res = await fetch(args.url, {
      method: args.method,
      headers: {
        ...authHeaders(args.token),
        Accept: 'application/json',
        ...(args.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(args.headers ?? {})
      },
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined
    });
  } catch {
    throw new RemoteDatasetApiError({
      message: 'Remote request failed (network error).',
      status: 0,
      statusText: 'NETWORK_ERROR',
      url: args.url,
      body: null,
      requestId: null,
      etag: null
    });
  }

  const etag = res.headers.get('ETag');
  const requestId = res.headers.get('X-Request-Id') ?? null;

  const txt = await res.text();
  if (!res.ok) {
    const body = tryParseJson(txt);

    const msg =
      typeof body === 'string'
        ? `${res.status} ${res.statusText}: ${body}`
        : `${res.status} ${res.statusText}`;

    throw new RemoteDatasetApiError({
      message: msg,
      status: res.status,
      statusText: res.statusText,
      url: args.url,
      body,
      requestId,
      etag
    });
  }

  const data = (tryParseJson(txt) as T) ?? (null as any as T);
  return { data, etag };
}

export async function requestNoContent(args: {
  url: string;
  method: 'DELETE';
  token: string;
  headers?: HeadersInit;
}): Promise<{ etag: string | null }> {
  let res: Response;
  try {
    res = await fetch(args.url, {
      method: args.method,
      headers: {
        ...authHeaders(args.token),
        Accept: 'application/json',
        ...(args.headers ?? {})
      }
    });
  } catch {
    throw new RemoteDatasetApiError({
      message: 'Remote request failed (network error).',
      status: 0,
      statusText: 'NETWORK_ERROR',
      url: args.url,
      body: null,
      requestId: null,
      etag: null
    });
  }

  const etag = res.headers.get('ETag');
  const requestId = res.headers.get('X-Request-Id') ?? null;

  if (!res.ok) {
    const txt = await res.text();
    const body = tryParseJson(txt);
    const msg =
      typeof body === 'string'
        ? `${res.status} ${res.statusText}: ${body}`
        : `${res.status} ${res.statusText}`;

    throw new RemoteDatasetApiError({
      message: msg,
      status: res.status,
      statusText: res.statusText,
      url: args.url,
      body,
      requestId,
      etag
    });
  }

  return { etag };
}
