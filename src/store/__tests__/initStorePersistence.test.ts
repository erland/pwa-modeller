// We mock the store + persistence modules so these tests stay unit-level
// (and do not interact with the real singleton store or browser localStorage).

type PersistedState = { model: unknown; fileName: string | null; isDirty: boolean };
type StoreState = PersistedState & { activeDatasetId: string };

describe('initStorePersistence', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.useFakeTimers();
    // initStorePersistence has a hard guard for NODE_ENV === 'test'.
    // For these unit tests, temporarily disable the guard.
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('hydrates restored state (if present) and schedules a startup persist', async () => {
    const subscribers: Array<(e: any) => void> = [];
    const mockState: StoreState = { activeDatasetId: 'local:default', model: null, fileName: null, isDirty: false };

    jest.doMock('../modelStore', () => {
      return {
        modelStore: {
          hydrate: jest.fn((s: PersistedState & { activeDatasetId?: string }) => {
            mockState.model = s.model;
            mockState.fileName = s.fileName;
            mockState.isDirty = s.isDirty;
          }),
          getState: jest.fn(() => ({ ...mockState })),
          setPersistenceOk: jest.fn(),
          setPersistenceError: jest.fn(),
          subscribeFlush: jest.fn((fn: (e: any) => void) => {
            subscribers.push(fn);
            return () => {
              /* no-op */
            };
          })
        }
      };
    });

    const persistState = jest.fn(async () => undefined);
    const restored: PersistedState = { model: { id: 'm1' }, fileName: 'restored.json', isDirty: true };

    jest.doMock('../getDefaultDatasetBackend', () => {
      return {
        getDefaultDatasetBackend: jest.fn(() => ({
          kind: 'local',
          loadPersistedState: jest.fn(async () => restored),
          persistState,
          clearPersistedState: jest.fn()
        }))
      };
    });

    // Import after mocks are set up.
    const { initStorePersistenceAsync: init } = await import('../initStorePersistence');

    await init();

    const { modelStore } = await import('../modelStore');
    expect(modelStore.hydrate).toHaveBeenCalledWith({ ...restored, activeDatasetId: 'local:default' });
    expect(modelStore.subscribeFlush).toHaveBeenCalledTimes(1);

    // Startup persistence is scheduled via setTimeout(250) in JSDOM.
    expect(persistState).not.toHaveBeenCalled();
    jest.advanceTimersByTime(260);
    expect(persistState).toHaveBeenCalledTimes(1);
    expect(persistState).toHaveBeenCalledWith('local:default', { model: restored.model, fileName: 'restored.json', isDirty: true });
  });

  test('debounces multiple store changes into a single persistence write', async () => {
    const subscribers: Array<(e: any) => void> = [];
    const mockState: StoreState = { activeDatasetId: 'local:default', model: { id: 'm2' }, fileName: 'x.json', isDirty: false };

    jest.doMock('../modelStore', () => {
      return {
        modelStore: {
          hydrate: jest.fn(),
          getState: jest.fn(() => ({ ...mockState })),
          setPersistenceOk: jest.fn(),
          setPersistenceError: jest.fn(),
          subscribeFlush: jest.fn((fn: (e: any) => void) => {
            subscribers.push(fn);
            return () => {
              /* no-op */
            };
          })
        }
      };
    });

    const persistState = jest.fn(async () => undefined);
    jest.doMock('../getDefaultDatasetBackend', () => {
      return {
        getDefaultDatasetBackend: jest.fn(() => ({
          kind: 'local',
          loadPersistedState: jest.fn(async () => null),
          persistState,
          clearPersistedState: jest.fn()
        }))
      };
    });

    const { initStorePersistenceAsync: init } = await import('../initStorePersistence');

    await init();

    // Trigger store changes rapidly while the idle persist is pending.
    expect(subscribers.length).toBe(1);
    subscribers[0]?.({ datasetId: 'local:default', persisted: { model: mockState.model, fileName: 'x.json', isDirty: false }, changeSet: { modelMetadataChanged: false, elementUpserts: [], elementDeletes: [], relationshipUpserts: [], relationshipDeletes: [], connectorUpserts: [], connectorDeletes: [], viewUpserts: [], viewDeletes: [], folderUpserts: [], folderDeletes: [] }, timestamp: Date.now() });
    subscribers[0]?.({ datasetId: 'local:default', persisted: { model: mockState.model, fileName: 'x.json', isDirty: false }, changeSet: { modelMetadataChanged: false, elementUpserts: [], elementDeletes: [], relationshipUpserts: [], relationshipDeletes: [], connectorUpserts: [], connectorDeletes: [], viewUpserts: [], viewDeletes: [], folderUpserts: [], folderDeletes: [] }, timestamp: Date.now() });
    subscribers[0]?.({ datasetId: 'local:default', persisted: { model: mockState.model, fileName: 'x.json', isDirty: false }, changeSet: { modelMetadataChanged: false, elementUpserts: [], elementDeletes: [], relationshipUpserts: [], relationshipDeletes: [], connectorUpserts: [], connectorDeletes: [], viewUpserts: [], viewDeletes: [], folderUpserts: [], folderDeletes: [] }, timestamp: Date.now() });

    jest.advanceTimersByTime(260);

    // One write only: the startup write (schedulePersist called once)
    // and subsequent calls while pending are ignored.
    expect(persistState).toHaveBeenCalledTimes(1);
    expect(persistState).toHaveBeenCalledWith('local:default', { model: mockState.model, fileName: 'x.json', isDirty: false });
  });
});