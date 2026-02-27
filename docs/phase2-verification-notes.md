# Phase 2 verification notes (pwa-modeller)

This checklist focuses on verifying the **client-side** Phase 2 behavior against a Phase 2-capable server.

## Local build / unit tests

From repo root:

```bash
npm ci
npm run lint
npm test
npm run build
```

## Manual verification scenarios

All scenarios assume:
- `baseUrl` points at your `java-modeller-server`
- you have at least one remote dataset to open

### 1) Create dataset with validation policy
- Open **Remote datasets** dialog
- Create dataset with:
  - `none`
  - `basic`
  - `strict`
- Verify the server receives the chosen policy and datasets can be opened.

### 2) Lease acquire/refresh/release
- Open a remote dataset as `EDITOR` or `OWNER`
- Verify (server logs) that:
  - `POST /datasets/{id}/lease` occurs on open
  - lease refresh happens periodically while open
- Switch to another dataset
  - verify `DELETE /datasets/{id}/lease` is attempted

### 3) Lease conflict UX (locked by another user)
- In Browser A: open remote dataset as editor/owner (lease acquired)
- In Browser B: open same dataset as editor/owner
- Expect Browser B to show **Lease conflict** dialog with holder + expiry.
- Try:
  - **Retry** (should still conflict while A holds it)
  - **Open read-only** (dialog closes; auto-save remains paused)

### 4) Snapshot write requires lease token
- Ensure you are `EDITOR/OWNER` and have a lease token
- Make a change to create a dirty state
- Verify snapshot PUT includes `X-Lease-Token` header (via server logs / devtools).

### 5) Validation errors dialog (`VALIDATION_FAILED`)
- Use a strict policy dataset and perform an edit that the server rejects
- Expect **Validation errors** dialog
- Try:
  - **Export local snapshot**
  - **Keep auto-save paused**
  - **Resume auto-save** after undoing/fixing the invalid change

### 6) Head polling remote-change prompt
- In Browser A: open dataset and make unsaved local changes (dirty)
- In Browser B: open same dataset and save a change
- In Browser A:
  - after a poll interval, expect **Remote changed** dialog
  - choose:
    - **Reload from server** (discard local changes)
    - **Keep local changes** (next save may conflict)

### 7) Enriched snapshot conflict fields
- Force a snapshot conflict by saving from two clients with stale `If-Match`
- Expect conflict dialog to display:
  - server **revision** (if provided)
  - server **updatedAt/updatedBy** (preferred)
  - fallback to savedAt/savedBy when updated* absent

### 8) History + restore (optional message)
- Open remote datasets dialog → choose **History**
- Verify history list shows revision + saved/updated metadata
- Restore a prior revision:
  - enter an optional message
  - verify dataset reloads to the restored content

### 9) Owner-only force override (`force=true`)
- Cause a lease conflict (another user holds the lease)
- As `OWNER`, verify:
  - force save action appears
  - checkbox confirmation is required
  - when executed, server receives `?force=true`
- In History dialog:
  - as `OWNER`, verify force restore option works similarly
