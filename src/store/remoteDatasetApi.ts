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

export type ValidationError = {
  severity: string;
  rule: string;
  path: string;
  message: string;
};

export type ApiError = {
  timestamp?: string;
  status: number;
  // Some server versions return `code`, others return `errorCode`.
  code: string;
  errorCode?: string;
  message: string;
  path?: string;
  requestId?: string;
  // Only present for VALIDATION_FAILED today
  validationErrors?: ValidationError[];
};

// ------------------------
// Phase 3 (ops-based sync)
// ------------------------

export type OperationType = 'SNAPSHOT_REPLACE' | 'JSON_PATCH' | (string & {});

export type OperationDto = {
  opId: string;
  type: OperationType;
  payload: unknown;
};

export type AppendOperationsRequest = {
  baseRevision: number;
  operations: OperationDto[];
};

export type AppendOperationsResponse = {
  /** Optional for compatibility with server implementations that do not include it. */
  datasetId?: string;
  newRevision: number;
  acceptedCount?: number;
  // Some server versions may return additional metadata.
  [k: string]: unknown;
};

export type OperationEvent = {
  datasetId: string;
  revision: number;
  op: OperationDto;
  createdAt?: string | null;
  createdBy?: string | null;
};

// Some server versions (including java-modeller-server Phase 3) send the op fields
// at top-level instead of nesting them under `op`.
type OperationEventFlat = {
  datasetId: string;
  revision: number;
  opId: string;
  type: OperationType;
  payload: unknown;
  createdAt?: string | null;
  createdBy?: string | null;
};

function normalizeOperationEvent(raw: unknown): OperationEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r: any = raw as any;

  // Preferred shape: { datasetId, revision, op: { opId, type, payload }, … }
  if (r.op && typeof r.op === 'object') {
    const op: any = r.op;
    if (typeof op.opId !== 'string' || typeof op.type !== 'string') return null;
    return {
      datasetId: String(r.datasetId ?? ''),
      revision: Number(r.revision ?? 0),
      op: { opId: op.opId, type: op.type, payload: op.payload },
      createdAt: r.createdAt ?? null,
      createdBy: r.createdBy ?? null
    };
  }

  // Flat shape: { datasetId, revision, opId, type, payload, … }
  if (typeof r.opId === 'string' && typeof r.type === 'string') {
    const flat = r as OperationEventFlat;
    return {
      datasetId: String(flat.datasetId ?? ''),
      revision: Number(flat.revision ?? 0),
      op: { opId: flat.opId, type: flat.type, payload: flat.payload },
      createdAt: (flat as any).createdAt ?? null,
      createdBy: (flat as any).createdBy ?? null
    };
  }

  return null;
}

export type OpsSinceResponse = {
  datasetId: string;
  fromRevision: number;
  items: OperationEvent[];
};

/**
 * Current materialized snapshot (Phase 1/2 endpoint): GET /datasets/{id}/snapshot
 *
 * Note: this is distinct from the snapshot history endpoints under /snapshots.
 */
export type CurrentSnapshotResponse = {
  datasetId?: string;
  revision: number;
  payload: unknown;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type RevisionConflictResponse = {
  datasetId: string;
  currentRevision: number;
};

export type DuplicateOpIdResponse = {
  datasetId: string;
  opId: string;
  existingRevision: number;
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
  // Phase 2 servers may provide either saved* or updated* fields; keep both optional for compatibility.
  savedAt: string | null;
  savedBy: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  // Optional message stored with the snapshot (if server supports it).
  message?: string | null;
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

function isRemoteOpsDebugEnabled(): boolean {
  try {
    return localStorage.getItem('DEBUG_REMOTE_OPS_SYNC') === '1';
  } catch {
    return false;
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
  const t0 = performance.now();
  const dbg = isRemoteOpsDebugEnabled();
  const isOpsCall = args.url.includes('/ops');
  try {
    if (dbg && isOpsCall) {
      const bodyBytes = args.body === undefined ? 0 : new TextEncoder().encode(JSON.stringify(args.body)).length;
      // Note: keep comments free of three ASCII dots.
      console.log('[remoteApi] →', args.method, args.url, { bodyBytes });
    }
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
    if (dbg && isOpsCall) {
      const dt = Math.round(performance.now() - t0);
      console.warn('[remoteApi] ✖ network error', args.method, args.url, { ms: dt });
    }
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

    if (dbg && isOpsCall) {
      const dt = Math.round(performance.now() - t0);
      console.warn('[remoteApi] ✖', args.method, args.url, { status: res.status, ms: dt, requestId, etag, body });
    }
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

  if (dbg && isOpsCall) {
    const dt = Math.round(performance.now() - t0);
    console.log('[remoteApi] ✔', args.method, args.url, { status: res.status, ms: dt, requestId, etag });
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

/**
 * Phase 3: Append operations to the dataset.
 * POST /datasets/{id}/ops
 *
 * Headers:
 * - X-Lease-Token: <token> (required when caller is active lease holder)
 */
export async function appendOperations(
  datasetId: string,
  req: AppendOperationsRequest,
  options?: { leaseToken?: string | null; force?: boolean },
  args?: CommonArgs
): Promise<{ res: AppendOperationsResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);

  const headers: Record<string, string> = {};
  if (options?.leaseToken) headers['X-Lease-Token'] = options.leaseToken;

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/ops${options?.force ? '?force=true' : ''}`;

  const { data, etag } = await requestJson<AppendOperationsResponse>({
    url,
    method: 'POST',
    token,
    headers,
    body: req
  });

  return { res: data, etag };
}

/**
 * Phase 3: Catch-up operations since a revision.
 * GET /datasets/{id}/ops?fromRevision=…&limit=…
 */
export async function getOperationsSince(
  datasetId: string,
  fromRevision: number,
  options?: { limit?: number },
  args?: CommonArgs
): Promise<OpsSinceResponse> {
  const { baseUrl, token } = await resolveCommon(args);

  const qs = new URLSearchParams({ fromRevision: String(fromRevision) });
  if (typeof options?.limit === 'number') qs.set('limit', String(options.limit));

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/ops?${qs.toString()}`;
  const { data } = await requestJson<OpsSinceResponse>({
    url,
    method: 'GET',
    token
  });

  // Normalize OperationEvent shape for compatibility with servers that emit flat events.
  const itemsRaw: unknown[] = Array.isArray((data as any)?.items) ? ((data as any).items as unknown[]) : [];
  const items: OperationEvent[] = [];
  for (const it of itemsRaw) {
    const norm = normalizeOperationEvent(it);
    if (norm) items.push(norm);
  }
  return { ...(data as any), items } as OpsSinceResponse;
}

/**
 * Phase 1/2: Fetch the current materialized snapshot.
 * GET /datasets/{id}/snapshot
 */
export async function getCurrentSnapshot(
  datasetId: string,
  args?: CommonArgs
): Promise<{ snapshot: CurrentSnapshotResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<CurrentSnapshotResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/snapshot`,
    method: 'GET',
    token
  });
  return { snapshot: data, etag };
}

export type OpsStreamHandle = {
  /** Async iterable of OperationEvent payloads from the server stream. */
  events: AsyncIterable<OperationEvent>;
  /** Stop the stream. Safe to call multiple times. */
  close: () => void;
};

function parseSseEvents(buffer: string): { events: string[]; rest: string } {
  // SSE events are separated by a blank line.
  // We accept both \n\n and \r\n\r\n, and normalize by splitting on double-newline patterns.
  const parts = buffer.split(/\r?\n\r?\n/);
  if (parts.length <= 1) return { events: [], rest: buffer };
  const rest = parts.pop() ?? '';
  return { events: parts, rest };
}

function sseDataToJson(eventBlock: string): unknown | null {
  // Collect all `data:` lines. SSE allows multi-line data.
  const lines = eventBlock.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const ln of lines) {
    if (ln.startsWith('data:')) {
      dataLines.push(ln.slice('data:'.length).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n');
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Phase 3: Open an SSE stream for dataset operations.
 *
 * NOTE: This uses fetch streaming rather than native EventSource, so it can include Authorization headers.
 * GET /datasets/{id}/ops/stream?fromRevision=…&limit=…
 */
export async function openDatasetOpsStream(
  datasetId: string,
  options?: { fromRevision?: number; limit?: number },
  args?: CommonArgs
): Promise<OpsStreamHandle> {
  const { baseUrl, token } = await resolveCommon(args);

  const qs = new URLSearchParams();
  if (typeof options?.fromRevision === 'number') qs.set('fromRevision', String(options.fromRevision));
  if (typeof options?.limit === 'number') qs.set('limit', String(options.limit));

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/ops/stream${qs.toString() ? `?${qs.toString()}` : ''}`;

  const ctrl = new AbortController();
  let closed = false;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...authHeaders(token),
      Accept: 'text/event-stream'
    },
    signal: ctrl.signal
  });

  if (!res.ok) {
    const etag = res.headers.get('ETag');
    const requestId = res.headers.get('X-Request-Id') ?? null;
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
      url,
      body,
      requestId,
      etag
    });
  }

  const readerMaybe = res.body?.getReader();
  if (!readerMaybe) {
    // This should not happen in modern browsers, but keep a clear error for tests/environments.
    throw new Error('Streaming response body is not available');
  }
  // TS sometimes loses narrowing for captured variables inside async generators.
  const reader = readerMaybe;

  async function* gen(): AsyncGenerator<OperationEvent> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parsed = parseSseEvents(buffer);
      buffer = parsed.rest;

      for (const block of parsed.events) {
        const json = sseDataToJson(block);
        if (!json) continue;
        const norm = normalizeOperationEvent(json);
        if (norm) yield norm;
      }
    }
  }

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      ctrl.abort();
    } catch {
      // ignore
    }
  };

  return { events: gen(), close };
}