import { DATASET_REGISTRY_STORAGE_KEY } from '../datasetRegistry';
import type { DatasetId } from '../datasetTypes';
import { RemoteDatasetBackend, RemoteDatasetBackendError } from '../backends/remoteDatasetBackend';

describe('RemoteDatasetBackend.loadPersistedState', () => {
  const dsId = 'remote:ds1' as DatasetId;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    window.localStorage.clear();
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
