import { registerServiceWorker } from '../registerServiceWorker';

function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function mockLocation(hostname: string) {
  const reload = jest.fn();

  // jsdom's Location is not fully writable; replace with a minimal stub.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      hostname,
      reload
    }
  });

  return { reload };
}

function setServiceWorker(sw: any) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: sw
  });
}

describe('registerServiceWorker', () => {
  const originalAddEventListener = window.addEventListener;
  let loadHandler: (() => void) | undefined;

  beforeEach(() => {
    loadHandler = undefined;
    jest.restoreAllMocks();

    // Capture the load handler so tests can trigger it deterministically.
    window.addEventListener = ((type: any, handler: any) => {
      if (type === 'load') loadHandler = handler;
      return undefined as any;
    }) as any;
  });

  afterEach(() => {
    window.addEventListener = originalAddEventListener;

    // Best-effort cleanup of mocks.
    try {
      // @ts-expect-error cleanup
      delete (navigator as any).serviceWorker;
    } catch (e) {
      void e;
    }
    try {
      // @ts-expect-error cleanup
      delete (window as any).caches;
    } catch (e) {
      void e;
    }
  });

  test('no-ops when serviceWorker is not supported', () => {
    mockLocation('example.com');
    // Ensure navigator.serviceWorker is absent.
    try {
      // @ts-expect-error cleanup
      delete (navigator as any).serviceWorker;
    } catch (e) {
      void e;
    }

    registerServiceWorker();

    expect(loadHandler).toBeUndefined();
  });

  test('on localhost, unregisters existing registrations and clears caches on load', async () => {
    mockLocation('localhost');

    const unregister = jest.fn().mockResolvedValue(true);
    setServiceWorker({
      getRegistrations: jest.fn().mockResolvedValue([{ unregister }])
    });

    const keys = jest.fn().mockResolvedValue(['k1', 'k2']);
    const del = jest.fn().mockResolvedValue(true);
    (window as any).caches = { keys, delete: del };

    registerServiceWorker();
    expect(typeof loadHandler).toBe('function');

    loadHandler?.();
    await flushPromises();

    expect((navigator as any).serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(keys).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenNthCalledWith(1, 'k1');
    expect(del).toHaveBeenNthCalledWith(2, 'k2');
  });

  test('on non-localhost, registers sw.js on load and sends SKIP_WAITING for waiting worker when controlled', async () => {
    const { reload } = mockLocation('example.com');

    const waiting = { postMessage: jest.fn() };
    const installing = {
      state: 'installed',
      postMessage: jest.fn(),
      addEventListener: jest.fn((type: string, cb: any) => {
        if (type === 'statechange') cb();
      })
    };

    let updateFoundHandler: (() => void) | undefined;

    const reg: any = {
      waiting,
      installing,
      addEventListener: jest.fn((type: string, cb: any) => {
        if (type === 'updatefound') updateFoundHandler = cb;
      })
    };

    let controllerChangeHandler: (() => void) | undefined;

    const sw = {
      controller: {},
      register: jest.fn().mockResolvedValue(reg),
      addEventListener: jest.fn((type: string, cb: any) => {
        if (type === 'controllerchange') controllerChangeHandler = cb;
      })
    };
    setServiceWorker(sw);

    registerServiceWorker();
    expect(typeof loadHandler).toBe('function');

    loadHandler?.();
    await flushPromises();

    expect(sw.register).toHaveBeenCalledWith('sw.js');
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    // Simulate updatefound -> installed -> postMessage
    updateFoundHandler?.();
    expect(reg.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function));
    expect(installing.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function));
    expect(waiting.postMessage).toHaveBeenCalledTimes(1);
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    // Simulate controller change -> reload once
    controllerChangeHandler?.();
    controllerChangeHandler?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('does not throw when registration fails', async () => {
    mockLocation('example.com');

    const sw = {
      controller: {},
      register: jest.fn().mockRejectedValue(new Error('boom')),
      addEventListener: jest.fn()
    };
    setServiceWorker(sw);

    registerServiceWorker();
    loadHandler?.();
    await flushPromises();

    expect(sw.register).toHaveBeenCalledWith('sw.js');
  });
});
