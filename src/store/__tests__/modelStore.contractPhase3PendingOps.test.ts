import { createModelStore } from '../modelStore';
import { getRemoteDatasetSession, _resetRemoteDatasetSessions } from '../remoteDatasetSession';

describe('ModelStore command surface (contract) — Phase 3 pending ops mapping', () => {
  beforeEach(() => {
    _resetRemoteDatasetSessions();
  });

  test('when activeDatasetId is remote, a model update records a SNAPSHOT_REPLACE pending op', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const model = store.getState().model!;
    // Simulate working on a remote dataset
    store.hydrate({ model, fileName: 'remote.json', isDirty: false, activeDatasetId: 'remote:test' });

    store.updateModelMetadata({ description: 'Hello' });

    const session = getRemoteDatasetSession('remote:test');
    expect(session.pendingOps).toBeDefined();
    expect(session.pendingOps.length).toBe(1);
    expect(session.pendingOps[0].type).toBe('SNAPSHOT_REPLACE');
    // Payload is the current model snapshot
    const payload: any = session.pendingOps[0].payload;
    expect(payload?.metadata?.name).toBe('My Model');
    expect(payload?.metadata?.description).toBe('Hello');
  });

  test('when activeDatasetId is not remote, model updates do not record remote pending ops', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const model = store.getState().model!;
    store.hydrate({ model, fileName: 'local.json', isDirty: false, activeDatasetId: 'local:test' });

    // Ensure a session exists so we can observe it is unchanged
    const sessionBefore = getRemoteDatasetSession('local:test');
    expect(sessionBefore.pendingOps.length).toBe(0);

    store.updateModelMetadata({ description: 'Hello' });

    const sessionAfter = getRemoteDatasetSession('local:test');
    expect(sessionAfter.pendingOps.length).toBe(0);
  });
});
