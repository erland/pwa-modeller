import { requestJson, resolveCommon, authHeaders, tryParseJson } from './http';
import type {
  AppendOperationsRequest,
  AppendOperationsResponse,
  OpsSinceResponse,
  OperationEvent,
  OpsStreamHandle
} from './types';
import { RemoteDatasetApiError } from './types';

type CommonArgs = { baseUrl?: string; token?: string | null };

function normalizeOperationEvent(raw: any): OperationEvent | null {
  if (!raw || typeof raw !== 'object') return null;

  // Preferred shape: { datasetId, revision, op: { opId, type, payload }, … }
  if (raw.op && typeof raw.op === 'object') {
    return raw as OperationEvent;
  }

  // Flat shape: { datasetId, revision, opId, type, payload, … }
  if (typeof raw.opId === 'string' && typeof raw.type === 'string') {
    return {
      datasetId: String(raw.datasetId ?? ''),
      revision: Number(raw.revision ?? 0),
      op: {
        opId: raw.opId,
        type: raw.type,
        payload: raw.payload
      },
      createdAt: raw.createdAt ?? null,
      createdBy: raw.createdBy ?? null
    };
  }

  return null;
}

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
  const { data } = await requestJson<any>({
    url,
    method: 'GET',
    token
  });

  const itemsRaw = (data?.items ?? []) as any[];
  const items = itemsRaw.map(normalizeOperationEvent).filter(Boolean) as OperationEvent[];
  return { ...(data as any), items } as OpsSinceResponse;
}

/**
 * Phase 1/2: Fetch the current materialized snapshot.
 * GET /datasets/{id}/snapshot
 */

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
        // Trust but verify minimal shape.
        if (typeof json === 'object' && json) {
          const ev = normalizeOperationEvent(json);
          if (ev) yield ev;
        }
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
