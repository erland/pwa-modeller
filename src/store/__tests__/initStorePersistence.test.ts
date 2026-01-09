// We mock the store + persistence modules so these tests stay unit-level
// (and do not interact with the real singleton store or browser localStorage).

type PersistedState = { model: unknown; fileName: string | null; isDirty: boolean };

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
    const subscribers: Array<() => void> = [];
    const mockState: PersistedState = { model: null, fileName: null, isDirty: false };

    jest.doMock('../modelStore', () => {
      return {
        modelStore: {
          hydrate: jest.fn((s: PersistedState) => {
            mockState.model = s.model;
            mockState.fileName = s.fileName;
            mockState.isDirty = s.isDirty;
          }),
          getState: jest.fn(() => ({ ...mockState })),
          subscribe: jest.fn((fn: () => void) => {
            subscribers.push(fn);
            return () => {
              /* no-op */
            };
          })
        }
      };
    });

    const persistStoreState = jest.fn();
    const restored: PersistedState = { model: { id: 'm1' }, fileName: 'restored.json', isDirty: true };

    jest.doMock('../storePersistence', () => {
      return {
        loadPersistedStoreState: jest.fn(() => restored),
        persistStoreState
      };
    });

    // Import after mocks are set up.
    const { initStorePersistence: init } = await import('../initStorePersistence');

    init();

    const { modelStore } = await import('../modelStore');
    expect(modelStore.hydrate).toHaveBeenCalledWith(restored);
    expect(modelStore.subscribe).toHaveBeenCalledTimes(1);

    // Startup persistence is scheduled via setTimeout(250) in JSDOM.
    expect(persistStoreState).not.toHaveBeenCalled();
    jest.advanceTimersByTime(260);
    expect(persistStoreState).toHaveBeenCalledTimes(1);
    expect(persistStoreState).toHaveBeenCalledWith({ model: restored.model, fileName: 'restored.json', isDirty: true });
  });

  test('debounces multiple store changes into a single persistence write', async () => {
    const subscribers: Array<() => void> = [];
    const mockState: PersistedState = { model: { id: 'm2' }, fileName: 'x.json', isDirty: false };

    jest.doMock('../modelStore', () => {
      return {
        modelStore: {
          hydrate: jest.fn(),
          getState: jest.fn(() => ({ ...mockState })),
          subscribe: jest.fn((fn: () => void) => {
            subscribers.push(fn);
            return () => {
              /* no-op */
            };
          })
        }
      };
    });

    const persistStoreState = jest.fn();
    jest.doMock('../storePersistence', () => {
      return {
        loadPersistedStoreState: jest.fn(() => null),
        persistStoreState
      };
    });

    const { initStorePersistence: init } = await import('../initStorePersistence');

    init();

    // Trigger store changes rapidly while the idle persist is pending.
    expect(subscribers.length).toBe(1);
    subscribers[0]?.();
    subscribers[0]?.();
    subscribers[0]?.();

    jest.advanceTimersByTime(260);

    // One write only: the startup write (schedulePersist called once)
    // and subsequent calls while pending are ignored.
    expect(persistStoreState).toHaveBeenCalledTimes(1);
    expect(persistStoreState).toHaveBeenCalledWith({ model: mockState.model, fileName: 'x.json', isDirty: false });
  });
});
