# Publishing to server vs manual publishing

## Manual publishing (download)
Manual publishing produces files intended for static hosting (e.g. nginx on an intranet share).  
Depending on your current UI options, this may include:
- a **bundle ZIP** (containing `<bundleId>/manifest.json`, `model.json`, `indexes.json`)
- and/or a **manual latest.json** that points to `./<bundleId>/manifest.json`

This format assumes `latest.json` and the `<bundleId>/` folder are hosted as siblings.

## Server publishing (upload)
Server publishing uploads **only the bundle ZIP** to the publishing server API:

- `POST /api/datasets/{datasetId}/publish` (multipart)
  - `bundleZip` (file)
  - optional `title` (text)

The server stores bundles under `bundles/<bundleId>/…` and maintains `datasets/<datasetId>/latest.json`.
That server-side `latest.json` typically points to `../../bundles/<bundleId>/manifest.json` (or an absolute URL if configured).

### Important
Do not reuse/upload the manual `latest.json` to the server — the folder layout differs and the server maintains its own pointer.
