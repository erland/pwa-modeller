import { createRemoteOpsSyncController } from '../remoteOpsSync';
import { RemoteDatasetApiError } from '../../remoteDatasetApi';
import type { OperationEvent, OpsSinceResponse, OperationDto } from '../../remoteDatasetApi';
import { _resetRemoteDatasetSessions, setPendingOps } from '../../remoteDatasetSession';

function op(id: string): OperationDto {
  return { opId: id, type: 'SNAPSHOT_REPLACE', payload: { id } };
}

function ev(rev: number, id: string): OperationEvent {
  return { datasetId: 'srv', revision: rev, op: op(id) };
}

describe('phase3Sync remoteOpsSync', () => {
  test('catch-up then stream applies ops sequentially when clean', async () => {
    const applied: string[] = [];
    const hydrates: any[] = [];

    const store = {
      getState: () => ({ activeDatasetId: 'local:1', model: { v: 0 }, fileName: null, isDirty: false }),
      hydrate: (s: any) => hydrates.push(s),
      setPersistenceRemoteChanged: jest.fn()
    };

    const api = {
      acquireOrRefreshLease: jest.fn(),
      getOperationsSince: jest.fn(async () => ({ datasetId: 'srv', fromRevision: 1, items: [ev(2, 'a'), ev(3, 'b')] }) as OpsSinceResponse),
      openDatasetOpsStream: jest.fn(async () => {
        async function* gen() {
          yield ev(4, 'c');
          yield ev(5, 'd');
        }
        return { events: gen(), close: jest.fn() };
      }),
      getCurrentSnapshot: jest.fn(async () => ({ snapshot: { revision: 5, payload: { v: 99 } }, etag: '"x"' })),
      appendOperations: jest.fn()
    };

    _resetRemoteDatasetSessions();
    setPendingOps('local:2' as any, [op('pending')]);

    const ctrl = createRemoteOpsSyncController({
      // @ts-expect-error test store shape
      store,
      // @ts-expect-error test api shape
      api,
      apply: (model, ops) => {
        for (const o of ops) applied.push(o.opId);
        return { ...(model as any), v: applied.length };
      }
    });

    ctrl.start('local:1' as any, 'srv');

    // Let async loop run.
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(applied).toEqual(['a', 'b', 'c', 'd']);
    expect(hydrates.length).toBeGreaterThan(0);
    expect((store.setPersistenceRemoteChanged as any).mock.calls.length).toBe(0);
  });

  test('when dirty, does not hydrate and emits remote-changed indicator', async () => {
    const store = {
      getState: () => ({ activeDatasetId: 'local:2', model: { v: 0 }, fileName: null, isDirty: true }),
      hydrate: jest.fn(),
      setPersistenceRemoteChanged: jest.fn()
    };

    const api = {
      acquireOrRefreshLease: jest.fn(),
      getOperationsSince: jest.fn(async () => ({ datasetId: 'srv', fromRevision: 1, items: [ev(2, 'a')] }) as OpsSinceResponse),
      openDatasetOpsStream: jest.fn(async () => {
        async function* gen() {
          yield ev(3, 'b');
        }
        return { events: gen(), close: jest.fn() };
      }),
      getCurrentSnapshot: jest.fn(async () => ({ snapshot: { revision: 3, payload: { v: 99 } }, etag: '"x"' })),
      appendOperations: jest.fn()
    };

    _resetRemoteDatasetSessions();
    setPendingOps('local:2' as any, [op('pending')]);

    const ctrl = createRemoteOpsSyncController({
      // @ts-expect-error test store shape
      store,
      // @ts-expect-error test api shape
      api,
      apply: (model, ops) => ({ model, ops })
    });

    ctrl.start('local:2' as any, 'srv');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(store.hydrate).not.toHaveBeenCalled();
    expect(store.setPersistenceRemoteChanged).toHaveBeenCalled();
  });

  test('flushPending handles 409 REVISION_CONFLICT by discarding pending ops and reloading snapshot (Option A)', async () => {
    const hydrates: any[] = [];
    const store = {
      getState: () => ({ activeDatasetId: 'local:3', model: { v: 1 }, fileName: null, isDirty: true }),
      hydrate: (s: any) => hydrates.push(s),
      setPersistenceRemoteChanged: jest.fn()
    };

    const api = {
      acquireOrRefreshLease: jest.fn(),
      appendOperations: jest.fn(async () => {
        throw new RemoteDatasetApiError({
          message: '409',
          status: 409,
          statusText: 'CONFLICT',
          url: 'x',
          body: { datasetId: 'srv', currentRevision: 42 },
          requestId: null,
          etag: null
        });
      }),
      getOperationsSince: jest.fn(async () => ({ datasetId: 'srv', fromRevision: 1, items: [ev(2, 'a')] }) as OpsSinceResponse),
      openDatasetOpsStream: jest.fn(),
      getCurrentSnapshot: jest.fn(async () => ({ snapshot: { revision: 42, payload: { v: 999 } }, etag: '"x"' }))
    };

    const ctrl = createRemoteOpsSyncController({
      // @ts-expect-error test store shape
      store,
      // @ts-expect-error test api shape
      api,
      apply: (model, ops) => ({ ...(model as any), applied: ops.map(o => o.opId) })
    });

    // Seed pending ops via session helper used by prod code.
    const { setPendingOps, setLastAppliedRevision } = await import('../../remoteDatasetSession');
    setLastAppliedRevision('local:3' as any, 1);
    setPendingOps('local:3' as any, [op('p1')]);

    const res = await ctrl.flushPending('local:3' as any, 'srv');
    expect(res).toBeNull();
    expect(api.getCurrentSnapshot).toHaveBeenCalled();
    expect(hydrates.length).toBeGreaterThan(0);
    expect(store.setPersistenceRemoteChanged).toHaveBeenCalled();
  });

  test('flushPending treats 409 DuplicateOpId as success (idempotent retry)', async () => {
    const store = {
      getState: () => ({ activeDatasetId: 'local:4', model: { v: 1 }, fileName: null, isDirty: true }),
      hydrate: jest.fn(),
      setPersistenceRemoteChanged: jest.fn()
    };

    const api = {
      acquireOrRefreshLease: jest.fn(),
      appendOperations: jest.fn(async () => {
        throw new RemoteDatasetApiError({
          message: '409',
          status: 409,
          statusText: 'CONFLICT',
          url: 'x',
          body: { datasetId: 'srv', opId: 'p1', existingRevision: 7 },
          requestId: null,
          etag: null
        });
      }),
      getOperationsSince: jest.fn(),
      openDatasetOpsStream: jest.fn(),
      getCurrentSnapshot: jest.fn()
    };

    const ctrl = createRemoteOpsSyncController({
      // @ts-expect-error test store shape
      store,
      // @ts-expect-error test api shape
      api,
      apply: (m, _ops) => { void _ops; return m; }
    });

    const { setPendingOps, setLastAppliedRevision, getLastAppliedRevision } = await import('../../remoteDatasetSession');
    setLastAppliedRevision('local:4' as any, 1);
    setPendingOps('local:4' as any, [op('p1')]);

    const res = await ctrl.flushPending('local:4' as any, 'srv');
    expect(res?.newRevision).toBe(7);
    expect(getLastAppliedRevision('local:4' as any)).toBe(7);
  });

  test('flushPending retries append after acquiring lease when server requires X-Lease-Token (428)', async () => {
    const store = {
      getState: () => ({ activeDatasetId: 'local:5', model: { v: 1 }, fileName: null, isDirty: false }),
      hydrate: jest.fn(),
      setPersistenceRemoteChanged: jest.fn()
    };

    let call = 0;
    const api = {
      acquireOrRefreshLease: jest.fn(async () => ({ lease: { datasetId: 'srv', active: true, holderSub: 'me', acquiredAt: '', renewedAt: '', expiresAt: 'x', leaseToken: 'tok' }, etag: null })),
      appendOperations: jest.fn(async () => {
        call += 1;
        if (call === 1) {
          throw new RemoteDatasetApiError({
            message: '428',
            status: 428,
            statusText: 'PRECONDITION_REQUIRED',
            url: 'x',
            body: { status: 428, code: 'LEASE_TOKEN_REQUIRED', message: 'need token' },
            requestId: null,
            etag: null
          });
        }
        return { res: { datasetId: 'srv', newRevision: 10, acceptedCount: 1 }, etag: null };
      }),
      getOperationsSince: jest.fn(),
      openDatasetOpsStream: jest.fn(),
      getCurrentSnapshot: jest.fn()
    };

    const ctrl = createRemoteOpsSyncController({
      // @ts-expect-error test store shape
      store,
      // @ts-expect-error test api shape
      api,
      apply: (model, ops) => ({ ...(model as any), v: ops.length })
    });

    // Seed pending ops via session helper.
    const { setPendingOps, setLastAppliedRevision } = await import('../../remoteDatasetSession');
    setPendingOps('local:5' as any, [op('x')]);
    setLastAppliedRevision('local:5' as any, 0);

    const res = await ctrl.flushPending('local:5' as any, 'srv');
    expect(res?.newRevision).toBe(10);
    expect(api.acquireOrRefreshLease).toHaveBeenCalled();
    expect(api.appendOperations).toHaveBeenCalledTimes(2);
  });
});
