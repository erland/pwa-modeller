import { RemoteDatasetBackend, RemoteDatasetBackendError } from '../backends/remoteDatasetBackend';
import { _resetRemoteDatasetSessions, setPendingOps } from '../remoteDatasetSession';
import { RemoteDatasetApiError, type OperationDto } from '../remoteDatasetApi';

jest.mock('../../auth/oidcPkceAuth', () => ({
  getAccessToken: jest.fn(async () => 'tkn')
}));

jest.mock('../remoteDatasetSettings', () => ({
  loadRemoteDatasetSettings: jest.fn(() => ({ remoteAccessToken: null }))
}));

jest.mock('../datasetRegistry', () => ({
  loadDatasetRegistry: jest.fn(() => ({
    v: 1,
    activeDatasetId: 'remote:ds1',
    entries: [
      {
        datasetId: 'remote:ds1',
        name: 'Test',
        storageKind: 'remote',
        remote: { baseUrl: 'http://localhost/api', serverDatasetId: 'ds1', displayName: 'Test' },
        createdAt: 0,
        updatedAt: 0,
        lastOpenedAt: 0
      }
    ]
  }))
}));

jest.mock('../phase3Sync', () => ({
  remoteOpsSync: {
    flushPending: jest.fn(async () => undefined)
  }
}));

describe('RemoteDatasetBackend', () => {
  beforeEach(() => {
    _resetRemoteDatasetSessions();
    (global as any).fetch = jest.fn();
    jest.clearAllMocks();
  });

  test('loadPersistedState loads remote snapshot payload and stores ETag', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === 'ETag' ? '"7"' : null) },
      json: async () => ({ datasetId: 'ds1', revision: 7, payload: { id: 'm1' } })
    });

    const b = new RemoteDatasetBackend();
    const slice = await b.loadPersistedState('remote:ds1');

    // Payload in this test is NOT a full modeller model, so backend falls back to an empty model
    // with the registry name/displayName.
    expect(slice).toEqual(
      expect.objectContaining({
        fileName: null,
        isDirty: false,
        model: expect.objectContaining({
          metadata: expect.objectContaining({ name: 'Test' }),
          schemaVersion: 14
        })
      })
    );

    expect(b.getLastSeenEtag('remote:ds1')).toBe('"7"');
  });

  test('persistState is a no-op when there are no pending ops', async () => {
    const { remoteOpsSync } = require('../phase3Sync');
    const b = new RemoteDatasetBackend();

    await expect(b.persistState('remote:ds1', { model: { a: 1 } } as any)).resolves.toBeUndefined();
    expect(remoteOpsSync.flushPending).not.toHaveBeenCalled();
  });

  test('persistState maps 409 lease conflict into LEASE_CONFLICT (when pending ops exist)', async () => {
    const { remoteOpsSync } = require('../phase3Sync');
    remoteOpsSync.flushPending.mockImplementation(async () => {
      throw new RemoteDatasetApiError({
        message: '409',
        status: 409,
        statusText: 'Conflict',
        url: 'http://localhost/api/datasets/ds1/ops',
        body: { holderSub: 'user1' },
        requestId: null,
        etag: null
      });
    });

    setPendingOps('remote:ds1', [
      { opId: 'op1', type: 'SNAPSHOT_REPLACE', payload: { id: 'm1' } } as unknown as OperationDto
    ]);

    const b = new RemoteDatasetBackend();
    await expect(b.persistState('remote:ds1', { model: { a: 1 } } as any)).rejects.toMatchObject({
      code: 'LEASE_CONFLICT',
      status: 409,
      leaseHolderSub: 'user1'
    });
  });

  test('persistState maps 400 VALIDATION_FAILED into VALIDATION_FAILED (when pending ops exist)', async () => {
    const { remoteOpsSync } = require('../phase3Sync');
    remoteOpsSync.flushPending.mockImplementation(async () => {
      throw new RemoteDatasetApiError({
        message: '400',
        status: 400,
        statusText: 'Bad Request',
        url: 'http://localhost/api/datasets/ds1/ops',
        body: { errorCode: 'VALIDATION_FAILED', errors: [{ path: 'x', message: 'bad' }] },
        requestId: null,
        etag: null
      });
    });

    setPendingOps('remote:ds1', [
      { opId: 'op1', type: 'SNAPSHOT_REPLACE', payload: { id: 'm1' } } as unknown as OperationDto
    ]);

    const b = new RemoteDatasetBackend();
    await expect(b.persistState('remote:ds1', { model: { a: 1 } } as any)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
      apiCode: 'VALIDATION_FAILED'
    });
  });
});
