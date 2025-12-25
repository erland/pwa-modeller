import '@testing-library/jest-dom';

// react-aria-components may rely on browser APIs that JSDOM doesn't implement.
// Keep these minimal (and no-op) for unit tests.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  class ResizeObserver {
    observe() {
      /* no-op */
    }
    unobserve() {
      /* no-op */
    }
    disconnect() {
      /* no-op */
    }
  }
  (globalThis as any).ResizeObserver = ResizeObserver;
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = (() => {
    return {
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {
        /* deprecated */
      },
      removeListener: () => {
        /* deprecated */
      },
      addEventListener: () => {
        /* no-op */
      },
      removeEventListener: () => {
        /* no-op */
      },
      dispatchEvent: () => false
    } as unknown as MediaQueryList;
  }) as any;
}

// Silence React Router v6 "Future Flag" warnings in tests.
// These warnings are helpful during upgrades, but they add noise to test output.
const originalWarn = console.warn;

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
