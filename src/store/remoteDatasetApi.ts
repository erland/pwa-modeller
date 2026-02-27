import { loadRemoteDatasetSettings } from './remoteDatasetSettings';
import { getAccessToken } from '../auth/oidcPkceAuth';

/**
 * Phase 2 additions:
 * - validationPolicy on dataset create + metadata
 * - leases (acquire/refresh, status, release)
 * - head polling
 * - snapshot history + restore
 *
 * This module intentionally keeps HTTP calls centralized and typed to match the server contract
 * documented in docs/phase2-step-by-step-plan-B.md.
 */

export type ValidationPolicy = 'none' | 'basic' | 'strict';
export type Role = 'VIEWER' | 'EDITOR' | 'OWNER';

export type ApiError = {
  timestamp?: string;
  status: number;
  code: string;
  message: string;
  path?: string;
  requestId?: string;
  // Only present for VALIDATION_FAILED today
  validationErrors?: Array<{
    severity: string;
    rule: string;
    path: string;
    message: string;
  }>;
};

export type LeaseConflictResponse = {
  datasetId: string;
  holderSub: string;
  expiresAt: string;
};

export type DatasetLeaseResponse =
  | {
      datasetId: string;
      active: false;
    }
  | {
      datasetId: string;
      active: true;
      holderSub: string;
      acquiredAt: string;
      renewedAt: string;
      expiresAt: string;
      // Only returned by POST (acquire/refresh). For GET it is null.
      leaseToken: string | null;
    };

export type DatasetHeadResponse = {
  datasetId: string;
  currentRevision: number;
  currentEtag: string;
  updatedAt: string | null;
  updatedBy: string | null;
  validationPolicy: ValidationPolicy;
  archivedAt: string | null;
  deletedAt: string | null;
  leaseActive: boolean;
  leaseHolderSub?: string | null;
  leaseExpiresAt?: string | null;
};

export type SnapshotConflictResponse = {
  datasetId: string;
  currentRevision: number;
  currentEtag: string;
  savedAt?: string | null;
  savedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type SnapshotResponse = {
  datasetId: string;
  revision: number;
  savedAt?: string | null;
  savedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  schemaVersion?: number | null;
  payload: unknown;
};

export type SnapshotHistoryItem = {
  revision: number;
  etag: string;
  savedAt: string | null;
  savedBy: string | null;
  schemaVersion: number | null;
};

export type SnapshotHistoryResponse = {
  datasetId: string;
  items: SnapshotHistoryItem[];
};

export type RemoteDatasetListItem = {
  datasetId: string;
  name: string;
  description?: string | null;
  updatedAt?: string | number | null;
  createdAt?: string | number | null;

  // Phase 2 metadata (optional because server may omit fields depending on version)
  currentRevision?: number | null;
  validationPolicy?: ValidationPolicy | null;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DELETED' | string | null;
  role?: Role | null;
};

export class RemoteDatasetApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: unknown;
  readonly requestId: string | null;
  readonly etag: string | null;

  constructor(args: {
    message: string;
    status: number;
    statusText: string;
    url: string;
    body: unknown;
    requestId: string | null;
    etag: string | null;
  }) {
    super(args.message);
    this.name = 'RemoteDatasetApiError';
    this.status = args.status;
    this.statusText = args.statusText;
    this.url = args.url;
    this.body = args.body;
    this.requestId = args.requestId;
    this.etag = args.etag;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requireAccessToken(): Promise<string> {
  // Prefer PKCE session tokens.
  const t = await getAccessToken();
  if (t) return t;
  // Back-compat: allow legacy token saved in settings.
  const settings = loadRemoteDatasetSettings();
  if (settings.remoteAccessToken) return settings.remoteAccessToken;
  throw new Error('Not signed in (no access token)');
}

function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson<T>(args: {
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
  } catch (e) {
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

async function requestNoContent(args: {
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

function toListItem(v: unknown): RemoteDatasetListItem | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const datasetId = (r['datasetId'] ?? r['id']) as unknown;
  const name = (r['name'] ?? r['title']) as unknown;
  if (typeof datasetId !== 'string' || typeof name !== 'string') return null;

  const description =
    typeof r['description'] === 'string' ? (r['description'] as string) : r['description'] == null ? null : undefined;

  const validationPolicy =
    r['validationPolicy'] === 'none' || r['validationPolicy'] === 'basic' || r['validationPolicy'] === 'strict'
      ? (r['validationPolicy'] as ValidationPolicy)
      : r['validationPolicy'] == null
        ? null
        : undefined;

  const role =
    r['role'] === 'OWNER' || r['role'] === 'EDITOR' || r['role'] === 'VIEWER'
      ? (r['role'] as Role)
      : r['role'] == null
        ? null
        : undefined;

  return {
    datasetId,
    name,
    description,
    updatedAt: (r['updatedAt'] as any) ?? null,
    createdAt: (r['createdAt'] as any) ?? null,
    currentRevision: typeof r['currentRevision'] === 'number' ? (r['currentRevision'] as number) : null,
    validationPolicy,
    status: (r['status'] as any) ?? null,
    role
  };
}

/**
 * Lists datasets visible to the current user.
 * Phase 1 contract: GET {baseUrl}/datasets, token auth.
 */
export async function listRemoteDatasets(args?: { baseUrl?: string; token?: string | null }): Promise<RemoteDatasetListItem[]> {
  const settings = loadRemoteDatasetSettings();
  const baseUrl = normalizeBaseUrl(args?.baseUrl ?? settings.remoteServerBaseUrl ?? '');
  if (!baseUrl) throw new Error('Remote server baseUrl is not set');
  const token = typeof args?.token === 'undefined' ? await requireAccessToken() : args.token;
  if (!token) throw new Error('Not signed in (no access token)');

  const { data: json } = await requestJson<unknown>({
    url: `${baseUrl}/datasets`,
    method: 'GET',
    token
  });

  const rawItems = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as any).items)
      ? (json as any).items
      : [];

  const items: RemoteDatasetListItem[] = [];
  for (const it of rawItems) {
    const mapped = toListItem(it);
    if (mapped) items.push(mapped);
  }
  return items;
}

/**
 * Creates a new dataset.
 * Phase 2 contract: POST {baseUrl}/datasets with {name, description?, validationPolicy?}.
 */
export async function createRemoteDataset(input: {
  baseUrl?: string;
  token?: string | null;
  name: string;
  description?: string;
  validationPolicy?: ValidationPolicy;
}): Promise<RemoteDatasetListItem> {
  const settings = loadRemoteDatasetSettings();
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? settings.remoteServerBaseUrl ?? '');
  if (!baseUrl) throw new Error('Remote server baseUrl is not set');
  const token = typeof input.token === 'undefined' ? await requireAccessToken() : input.token;
  if (!token) throw new Error('Not signed in (no access token)');

  const body: any = { name: input.name, description: input.description ?? null };
  if (input.validationPolicy) body.validationPolicy = input.validationPolicy;

  const { data: json } = await requestJson<unknown>({
    url: `${baseUrl}/datasets`,
    method: 'POST',
    token,
    body
  });

  const item = toListItem(json);
  if (!item) throw new Error('Unexpected create dataset response');
  return item;
}

type CommonArgs = { baseUrl?: string; token?: string | null };

async function resolveCommon(args?: CommonArgs): Promise<{ baseUrl: string; token: string }> {
  const settings = loadRemoteDatasetSettings();
  const baseUrl = normalizeBaseUrl(args?.baseUrl ?? settings.remoteServerBaseUrl ?? '');
  if (!baseUrl) throw new Error('Remote server baseUrl is not set');
  const token = typeof args?.token === 'undefined' ? await requireAccessToken() : args.token;
  if (!token) throw new Error('Not signed in (no access token)');
  return { baseUrl, token };
}

/**
 * Head polling: GET /datasets/{datasetId}/head
 */
export async function getDatasetHead(
  datasetId: string,
  args?: CommonArgs
): Promise<{ head: DatasetHeadResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<DatasetHeadResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/head`,
    method: 'GET',
    token
  });
  return { head: data, etag };
}

/**
 * Leases: POST /datasets/{datasetId}/lease (acquire or refresh)
 */
export async function acquireOrRefreshLease(
  datasetId: string,
  args?: CommonArgs
): Promise<{ lease: DatasetLeaseResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<DatasetLeaseResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/lease`,
    method: 'POST',
    token
  });
  return { lease: data, etag };
}

/**
 * Leases: GET /datasets/{datasetId}/lease (status)
 */
export async function getLeaseStatus(
  datasetId: string,
  args?: CommonArgs
): Promise<{ lease: DatasetLeaseResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<DatasetLeaseResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/lease`,
    method: 'GET',
    token
  });
  return { lease: data, etag };
}

/**
 * Leases: DELETE /datasets/{datasetId}/lease (release)
 * Server always returns 204.
 */
export async function releaseLease(datasetId: string, args?: CommonArgs): Promise<void> {
  const { baseUrl, token } = await resolveCommon(args);
  await requestNoContent({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/lease`,
    method: 'DELETE',
    token
  });
}

/**
 * History: GET /datasets/{datasetId}/snapshots?limit=..&offset=..
 */
export async function listSnapshotHistory(
  datasetId: string,
  paging?: { limit?: number; offset?: number },
  args?: CommonArgs
): Promise<{ history: SnapshotHistoryResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const qs = new URLSearchParams();
  if (typeof paging?.limit === 'number') qs.set('limit', String(paging.limit));
  if (typeof paging?.offset === 'number') qs.set('offset', String(paging.offset));

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/snapshots${qs.toString() ? `?${qs.toString()}` : ''}`;

  const { data, etag } = await requestJson<SnapshotHistoryResponse>({
    url,
    method: 'GET',
    token
  });
  return { history: data, etag };
}

/**
 * Restore: POST /datasets/{datasetId}/snapshots/{revision}/restore?force=true
 *
 * Headers:
 * - If-Match: "<etag>" (required)
 * - X-Lease-Token: <token> (required when caller is active lease holder)
 */
export async function restoreSnapshotRevision(
  datasetId: string,
  revision: number,
  body?: { message?: string },
  options?: { ifMatch: string; leaseToken?: string | null; force?: boolean },
  args?: CommonArgs
): Promise<{ snapshot: SnapshotResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);

  const headers: Record<string, string> = {
    'If-Match': options?.ifMatch ?? '"0"'
  };
  if (options?.leaseToken) headers['X-Lease-Token'] = options.leaseToken;

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/snapshots/${encodeURIComponent(
    String(revision)
  )}/restore${options?.force ? '?force=true' : ''}`;

  const { data, etag } = await requestJson<SnapshotResponse>({
    url,
    method: 'POST',
    token,
    headers,
    body: body && body.message ? { message: body.message } : undefined
  });

  return { snapshot: data, etag };
}
