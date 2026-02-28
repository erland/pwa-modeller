import {
  appendOperations,
  getOperationsSince,
  openDatasetOpsStream,
  type AppendOperationsRequest,
  type OpsSinceResponse,
  type AppendOperationsResponse,
  type OperationEvent
} from '../remoteDatasetApi';

type MockInit = { status?: number; headers?: Record<string, string> };

type MockHeaders = { get(name: string): string | null };

function makeHeaders(headers: Record<string, string>): MockHeaders {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) map.set(k.toLowerCase(), v);
  return {
    get(name: string) {
      return map.get(name.toLowerCase()) ?? null;
    }
  };
}

type MockResponse = {
  ok: boolean;
  status: number;
  headers: MockHeaders;
  json: () => Promise<any>;
  text: () => Promise<string>;
  body?: any;
};

function jsonResponse(body: unknown, init?: MockInit): MockResponse {
  const status = init?.status ?? 200;
  const headers = makeHeaders({
    'Content-Type': 'application/json',
    ...(init?.headers ?? {})
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null
  };
}

function streamResponse(body: any, init?: MockInit): MockResponse {
  const status = init?.status ?? 200;
  const headers = makeHeaders({
    'Content-Type': 'text/event-stream',
    ...(init?.headers ?? {})
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => {
      throw new Error('json() not supported for stream response');
    },
    text: async () => {
      throw new Error('text() not supported for stream response');
    },
    body
  };
}

function makeStream(chunks: string[]) {
  // Jest/node test env may not include WHATWG ReadableStream. We only need a minimal
  // object that provides body.getReader().read() yielding Uint8Array chunks.
  const enc = new TextEncoder();
  return {
    getReader() {
      let i = 0;
      return {
        async read(): Promise<{ value?: Uint8Array; done: boolean }> {
          if (i >= chunks.length) return { value: undefined, done: true };
          const value = enc.encode(chunks[i++]);
          return { value, done: false };
        }
      };
    }
  };
}


describe('remoteDatasetApi Phase 3 ops wrappers', () => {
  const baseUrl = 'https://example.test';
  const token = 'tok';
  const datasetId = 'ds1';

  beforeEach(() => {
    (globalThis.fetch as any) = jest.fn();
  });

  test('appendOperations posts to /ops with X-Lease-Token when provided', async () => {
    const req: AppendOperationsRequest = {
      baseRevision: 7,
      operations: [{ opId: 'op-1', type: 'SNAPSHOT_REPLACE', payload: { a: 1 } }]
    };

    const apiRes: AppendOperationsResponse = { datasetId, newRevision: 8, acceptedCount: 1 };

    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(apiRes, {
        headers: { ETag: '"etag-8"' }
      })
    );

    const { res, etag } = await appendOperations(datasetId, req, { leaseToken: 'lease-123' }, { baseUrl, token } as any);

    expect(res).toEqual(apiRes);
    expect(etag).toBe('"etag-8"');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe(`${baseUrl}/datasets/${encodeURIComponent(datasetId)}/ops`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.headers['X-Lease-Token']).toBe('lease-123');
  });

  test('getOperationsSince calls /ops with fromRevision and returns DTO', async () => {
    const apiRes: OpsSinceResponse = {
      datasetId,
      fromRevision: 10,
      items: [
        {
          datasetId,
          revision: 11,
          op: { opId: 'op-11', type: 'JSON_PATCH', payload: [{ op: 'replace', path: '/x', value: 1 }] }
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue(jsonResponse(apiRes));

    const got = await getOperationsSince(datasetId, 10, { limit: 50 }, { baseUrl, token } as any);
    expect(got).toEqual(apiRes);

    const [url] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe(`${baseUrl}/datasets/${encodeURIComponent(datasetId)}/ops?fromRevision=10&limit=50`);
  });

  test('openDatasetOpsStream parses streamed SSE data lines into OperationEvent objects', async () => {
    const e1: OperationEvent = {
      datasetId,
      revision: 3,
      op: { opId: 'op-3', type: 'SNAPSHOT_REPLACE', payload: { a: 1 } }
    };
    const e2: OperationEvent = {
      datasetId,
      revision: 4,
      op: { opId: 'op-4', type: 'JSON_PATCH', payload: [{ op: 'add', path: '/b', value: 2 }] }
    };

    const sse = [
      `data: ${JSON.stringify(e1)}\n\n`,
      `data: ${JSON.stringify(e2)}\n\n`
    ];

    (globalThis.fetch as any).mockResolvedValue(
      streamResponse(makeStream(sse))
    );

    const { events, close } = await openDatasetOpsStream(datasetId, { fromRevision: 2 }, { baseUrl, token } as any);

    const got: OperationEvent[] = [];
    for await (const ev of events) got.push(ev);

    close();

    expect(got).toEqual([e1, e2]);

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe(`${baseUrl}/datasets/${encodeURIComponent(datasetId)}/ops/stream?fromRevision=2`);
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.headers.Accept).toBe('text/event-stream');
  });
});
