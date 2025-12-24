import '@testing-library/jest-dom';

// Silence React Router v6 "Future Flag" warnings in tests.
// These warnings are helpful during upgrades, but they add noise to test output.
const originalWarn = console.warn;


beforeEach(() => {
  try {
    window.localStorage?.removeItem('pwa-modeller:storeState:v1');
  } catch {
    // ignore
  }
});

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const first = args[0];
    const msg = typeof first === 'string' ? first : '';

    // React Router v6 upgrade warnings (startTransition / relative splat path).
    if (msg.includes('React Router Future Flag Warning')) return;

    // Fall back to the original console.warn for everything else.
    // eslint-disable-next-line no-console
    originalWarn(...(args as any[]));
  });
});

afterAll(() => {
  (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
});