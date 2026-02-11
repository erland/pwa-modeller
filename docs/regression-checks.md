# Regression checks (Publish to Server)

This project now supports two publishing modes:

- **Manual publish (download)**: generates files for static hosting (ZIP + optional manual latest.json).
- **Server publish (upload)**: uploads only the ZIP to the publishing server API; server maintains dataset latest.json.

## Quick manual checklist
Run these after changes to publishing, portal, or model slicing:

### Build & static checks
- `npm run lint`
- `npm run build`
- `npm test`

### Manual publish (download)
1. Open a model workspace.
2. Open **Publish** dialog.
3. Publish scope: **Model** → Publish (download) succeeds; ZIP downloads.
4. Publish scope: **Folder** → ZIP downloads and contains only selected folder content.
5. Publish scope: **View** → ZIP downloads and contains only selected view content.
6. If manual `latest.json` is enabled in your UX: verify it points to `./<bundleId>/manifest.json` (manual layout).

### Server publish (upload)
Precondition: Publishing server reachable and base URL configured in dialog.
1. Enter a valid **Server base URL**.
2. Dataset discovery: verify dropdown shows existing datasets (if any).
3. Choose an existing dataset and publish → success message shown:
   - datasetId, bundleId, publishedAt (if returned)
4. Verify **Wiki link helper** shows a `latestUrl` (requires server `PUBLISH_BASE_URL`), and Copy works.
5. Publish again with a **new datasetId** (typed) → should succeed and appear in dropdown on next open.

### Failure modes
1. Wrong base URL → dataset list shows warning but Dataset ID input still usable.
2. Server returns `application/problem+json` → UI shows friendly error message.
3. DatasetId invalid (e.g. uppercase) → Publish to server button disabled.

## Notes
- Server publishing must **not** upload the manual `latest.json` because the server uses a different folder layout.
