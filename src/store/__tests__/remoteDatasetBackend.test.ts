import { DATASET_REGISTRY_STORAGE_KEY } from '../datasetRegistry';
import type { DatasetId } from '../datasetTypes';
import { RemoteDatasetBackend, type RemoteDatasetBackendError } from '../backends/remoteDatasetBackend';
import { _resetRemoteDatasetSessions, setLeaseExpiresAt, setLeaseToken } from '../remoteDatasetSession';

describe('RemoteDatasetBackend.loadPersistedState', () => {
  const dsId = 'remote:ds1' as DatasetId;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    window.localStorage.clear();
    _resetRemoteDatasetSessions();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = undefined;
  });

  function seedRegistry(): void {
    const registry = {
      v: 1,
      activeDatasetId: dsId,
      entries: [
        {
          datasetId: dsId,
          storageKind: 'remote',
          remote: {
            baseUrl: 'http://localhost:8081',
            serverDatasetId: '11111111-1111-1111-1111-111111111111',
            displayName: 'Test'
          },
          name: 'Remote Test',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    };
    window.localStorage.setItem(DATASET_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  }

  function seedSettings(token = 'abc'): void {
    window.localStorage.setItem('remoteDatasets.baseUrl', 'http://localhost:8081');
    window.localStorage.setItem('remoteDatasets.accessToken', token);
  }

  test('loads remote snapshot payload and stores ETag', async () => {
    seedRegistry();
    seedSettings('token123');

    const fetchMock = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (k: string) => (k.toLowerCase() === 'etag' ? '"7"' : null)
        },
        json: async () => ({ datasetId: 'x', revision: 7, payload: { id: 'm1' } })
      } as unknown as Response;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    const slice = await b.loadPersistedState(dsId);
    expect(slice).toEqual({ model: { id: 'm1' }, fileName: null, isDirty: false });

    expect(b.getLastSeenEtag(dsId)).toBe('"7"');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/datasets/11111111-1111-1111-1111-111111111111/snapshot');
    expect(init?.headers?.Authorization).toBe('Bearer token123');
  });

  test('throws AUTH_MISSING when no token is configured', async () => {
    seedRegistry();
    seedSettings('');

    const b = new RemoteDatasetBackend();
    await expect(b.loadPersistedState(dsId)).rejects.toMatchObject({
      name: 'RemoteDatasetBackendError',
      code: 'AUTH_MISSING'
    } satisfies Partial<RemoteDatasetBackendError>);
  });

  test('throws NOT_FOUND for 404', async () => {
    seedRegistry();
    seedSettings('token');

    const fetchMock = jest.fn(async () => {
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        json: async () => ({})
      } as unknown as Response;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.loadPersistedState(dsId)).rejects.toMatchObject({
      name: 'RemoteDatasetBackendError',
      code: 'NOT_FOUND',
      status: 404
    } satisfies Partial<RemoteDatasetBackendError>);
  });
});

describe('RemoteDatasetBackend.persistState', () => {
  const dsId = 'remote:ds1' as DatasetId;
  const serverId = '11111111-1111-1111-1111-111111111111';

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    window.localStorage.clear();
    _resetRemoteDatasetSessions();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = undefined;
  });

  function seedRegistry(): void {
    const registry = {
      v: 1,
      activeDatasetId: dsId,
      entries: [
        {
          datasetId: dsId,
          storageKind: 'remote',
          remote: {
            baseUrl: 'http://localhost:8081',
            serverDatasetId: serverId
          },
          name: 'Remote Test',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    };
    window.localStorage.setItem(DATASET_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  }

  function seedSettings(token = 'abc'): void {
    window.localStorage.setItem('remoteDatasets.baseUrl', 'http://localhost:8081');
    window.localStorage.setItem('remoteDatasets.accessToken', token);
  }

  function mockJsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
    const status = init?.status ?? 200;
    const headers = new Map<string, string>();
    headers.set('content-type', 'application/json');
    for (const [k, v] of Object.entries(init?.headers ?? {})) headers.set(k.toLowerCase(), v);

    // Minimal Response-like object for our api wrapper:
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : String(status),
      headers: {
        get: (k: string) => headers.get(k.toLowerCase()) ?? null
      },
      text: async () => JSON.stringify(body),
      json: async () => body
    } as unknown as Response;
  }

  test('persists via POST /ops with baseRevision and operations', async () => {
    seedRegistry();
    seedSettings('token123');

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`http://localhost:8081/datasets/${encodeURIComponent(serverId)}/ops`);
      expect(init?.method).toBe('POST');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = init?.headers as any;
      expect(h.Authorization).toBe('Bearer token123');
      expect(h['Content-Type']).toBe('application/json');

      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body).toMatchObject({
        baseRevision: 0,
        operations: expect.any(Array)
      });

      return mockJsonResponse({ datasetId: serverId, newRevision: 1 }, { status: 200 });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.persistState(dsId, { model: { a: 1 } } as any)).resolves.toBeUndefined();
  });

  test('includes X-Lease-Token header when session has a lease token', async () => {
    seedRegistry();
    seedSettings('token123');
    setLeaseToken(dsId, 'lease-abc');
    setLeaseExpiresAt(dsId, '2026-02-27T10:00:00Z');

    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = init?.headers as any;
      expect(h['X-Lease-Token']).toBe('lease-abc');
      return mockJsonResponse({ datasetId: serverId, newRevision: 2 }, { status: 200 });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.persistState(dsId, { model: { a: 1 } } as any)).resolves.toBeUndefined();
  });

  test('adds ?force=true when persistStateWithOptions is called with force', async () => {
    seedRegistry();
    seedSettings('token123');

    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toContain('?force=true');
      return mockJsonResponse({ datasetId: serverId, newRevision: 2 }, { status: 200 });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.persistStateWithOptions(dsId, { model: { a: 1 } } as any, { force: true })).resolves.toBeUndefined();
  });

  test('throws LEASE_CONFLICT on 409 with lease conflict body', async () => {
    seedRegistry();
    seedSettings('token123');

    const fetchMock = jest.fn(async () => {
      return mockJsonResponse(
        { datasetId: serverId, holderSub: 'user1', expiresAt: '2026-02-27T10:00:00Z' },
        { status: 409 }
      );
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.persistState(dsId, { model: { a: 1 } } as any)).rejects.toMatchObject({
      code: 'LEASE_CONFLICT',
      status: 409,
      leaseHolderSub: 'user1'
    } satisfies Partial<RemoteDatasetBackendError>);
  });

  test('throws VALIDATION_FAILED on 400 with ApiError VALIDATION_FAILED body', async () => {
    seedRegistry();
    seedSettings('token123');

    const fetchMock = jest.fn(async () => {
      return mockJsonResponse({ errorCode: 'VALIDATION_FAILED', message: 'Bad data' }, { status: 400 });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.persistState(dsId, { model: { a: 1 } } as any)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
      apiCode: 'VALIDATION_FAILED'
    } satisfies Partial<RemoteDatasetBackendError>);
  });

  test('revision conflict triggers discard + reload snapshot (does not throw)', async () => {
    seedRegistry();
    seedSettings('token123');

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();

      if (method === 'POST' && url.endsWith(`/datasets/${encodeURIComponent(serverId)}/ops`)) {
        // phase 3 append returns revision conflict
        return mockJsonResponse({ datasetId: serverId, currentRevision: 11 }, { status: 409 });
      }
      if (method === 'GET' && url.includes(`/datasets/${encodeURIComponent(serverId)}/ops?fromRevision=`)) {
        // best-effort catch-up after conflict
        return mockJsonResponse({ items: [], nextRevision: 12 }, { status: 200 });
      }
      if (method === 'GET' && url.endsWith(`/datasets/${encodeURIComponent(serverId)}/snapshot`)) {
        return mockJsonResponse({ datasetId: serverId, revision: 11, payload: { hello: 'remote' } }, { status: 200 });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const b = new RemoteDatasetBackend();
    await expect(b.persistState(dsId, { model: { hello: 'local' } } as any)).resolves.toBeUndefined();
  });
});
