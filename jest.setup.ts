import '@testing-library/jest-dom';

import { TextDecoder, TextEncoder } from 'util';

// Node/JSDOM in Jest may not expose TextEncoder/TextDecoder globally.
// Our ZIP writer and a few helpers rely on them.
if (typeof (globalThis as any).TextEncoder === 'undefined' || typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

// JSDOM doesn't implement the Canvas 2D API by default.
// Some layout helpers use canvas text measurement, so we provide a minimal mock
// to keep tests deterministic and avoid noisy console errors.
if (typeof (globalThis as any).HTMLCanvasElement !== 'undefined') {
  Object.defineProperty((globalThis as any).HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function getContext(type: string) {
      if (type !== '2d') return null;
      return {
        font: '',
        measureText: (t: string) => ({ width: Math.max(0, String(t).length) * 7 })
      } as any;
    }
  });
}

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
    originalWarn(...(args as any[]));
  });
});

afterAll(() => {
  (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
});
