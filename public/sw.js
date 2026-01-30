/*
  Minimal service worker for an MVP PWA.

  - Caches the app shell on install.
  - Serves cached content when offline.
  - Uses a simple network-first strategy for navigations.
*/

const CACHE_NAME = 'pwa-modeller-v2';

// Keep this list small; Vite will fingerprint assets.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

// Allow the app to trigger an update immediately.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return undefined;
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Handle navigation requests: network first, fallback to cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('./index.html');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Same-origin static assets: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) {
          // Stale-while-revalidate: return cache immediately, refresh in background.
          event.waitUntil(
            (async () => {
              try {
                const res = await fetch(req);
                if (res.ok) await cache.put(req, res.clone());
              } catch {
                // Ignore background refresh errors.
              }
            })()
          );
          return cached;
        }

        try {
          const res = await fetch(req);
          // Cache successful responses
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          // No cached version and offline
          return Response.error();
        }
      })()
    );
  }
});
