# Standalone HTML distribution

A release creates two independent browser deliverables:

- GitHub Pages: the normal PWA, with manifest and service worker.
- Release asset `pwa-modeller-vX.Y.Z.html`: a standalone HTML document with compiled JavaScript and CSS embedded.

## Build locally

```sh
npm ci
npm run build:standalone
```

The result is `release/pwa-modeller-dev.html`. The packager fails if generated JavaScript/CSS are not embedded or additional emitted build assets remain.

## Important limitations

The file can be opened with `file://` without a web server, but browser security policies still apply. In particular, storage via IndexedDB/localStorage can be blocked or isolated by browser and file location; do not rely on it as the sole durable copy. Export models to a file regularly.

The file is **not** an installed/offline PWA: the service worker and PWA manifest are excluded. Features that fetch URLs, depend on `public/config.json`, use OIDC redirects, or need a remote server may require online hosting/configuration. The standalone bundle embeds application assets, **not** remote datasets or arbitrary network responses.

For complete PWA and remote integration functionality, use the GitHub Pages distribution instead. Verify file-based opening in intended browsers before treating the standalone variant as fully supported.

## Release flow

Publishing a GitHub Release with tag `vX.Y.Z` builds/tests and deploys Pages, then uploads the single HTML asset to the same GitHub Release. The existing Docker workflow remains unchanged.

GitHub repository Settings → Pages → Build and deployment must be set to **GitHub Actions**.
