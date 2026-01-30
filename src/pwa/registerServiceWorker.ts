/**
 * Minimal service worker registration.
 *
 * - Registers `public/sw.js` when supported.
 * - Safe to call in tests (no-op when `serviceWorker` isn't available).
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // In local dev, a service worker is more likely to cause confusing "stale module"
  // issues (especially with code-splitting) than to help. Ensure we don't have an old
  // SW hanging around when running a local dev server.
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0';
  if (isLocalhost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => {
          if (!('caches' in window)) return;
          return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        })
        .catch(() => {
          // Ignore errors in dev.
        });
    });
    return;
  }

  // Register after load to avoid blocking first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // Use a relative URL so it works both locally and when hosted under a sub-path
      // (e.g. GitHub Pages: /<repo>/).
      .register('sw.js')
      .then((reg) => {
        // If there's already a waiting worker, activate it now.
        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // When a new SW is found, activate it as soon as it's installed.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Reload once the new SW takes control so we always run a consistent version.
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
      })
      .catch(() => {
        // Silent failure for MVP.
      });
  });
}
