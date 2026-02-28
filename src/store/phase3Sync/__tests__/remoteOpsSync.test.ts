import { createRemoteOpsSyncController } from '../remoteOpsSync';
import type { OperationEvent, OpsSinceResponse, OperationDto } from '../../remoteDatasetApi';

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
      getOperationsSince: jest.fn(async () => ({ datasetId: 'srv', fromRevision: 1, items: [ev(2, 'a'), ev(3, 'b')] }) as OpsSinceResponse),
      openDatasetOpsStream: jest.fn(async () => {
        async function* gen() {
          yield ev(4, 'c');
          yield ev(5, 'd');
        }
        return { events: gen(), close: jest.fn() };
      }),
      appendOperations: jest.fn()
    };

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
      getOperationsSince: jest.fn(async () => ({ datasetId: 'srv', fromRevision: 1, items: [ev(2, 'a')] }) as OpsSinceResponse),
      openDatasetOpsStream: jest.fn(async () => {
        async function* gen() {
          yield ev(3, 'b');
        }
        return { events: gen(), close: jest.fn() };
      }),
      appendOperations: jest.fn()
    };

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
});
