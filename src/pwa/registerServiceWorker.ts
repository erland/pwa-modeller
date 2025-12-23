/**
 * Minimal service worker registration.
 *
 * - Registers `public/sw.js` when supported.
 * - Safe to call in tests (no-op when `serviceWorker` isn't available).
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // Register after load to avoid blocking first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // Use a relative URL so it works both locally and when hosted under a sub-path
      // (e.g. GitHub Pages: /<repo>/).
      .register('sw.js')
      .catch(() => {
        // Silent failure for MVP.
      });
  });
}
