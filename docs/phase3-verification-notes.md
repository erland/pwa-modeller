# Phase 3 verification notes

This document lists quick checks to validate the Phase 3 ops-based remote dataset behavior.

## Local verification commands

From the repo root:

- Install:
  - `npm ci`
- Typecheck/build:
  - `npm run build`
- Tests:
  - `npm test`
- Lint:
  - `npm run lint`

## Manual test checklist

### 1) Smoke: open remote dataset

1. Configure a remote dataset reference (same flow you already use for Phase 2).
   - If you are pointing at the **nginx edge** from the java-modeller-server demo, the base URL should include `/api` (for example `http://localhost:8081/api`).
   - If you expose Quarkus directly (no `/api` prefix), use the Quarkus base URL.
2. Open the remote dataset.
3. Expected:
   - model loads (snapshot GET)
   - Sync chip shows **Sync Live** shortly after (SSE connected)
   - Diagnostics shows:
     - `sseConnected=true`
     - `lastAppliedRevision` populated

### 2) Real-time propagation: two windows

1. Open **Window A** and **Window B** on the same remote dataset.
2. In Window A, make a small edit and save.
3. Expected:
   - A sends `POST /datasets/{id}/ops`.
   - A pending ops count returns to 0 after success.
   - B receives the change via stream and updates without manual reload.

### 3) Lease-required server

If the server enforces leases for `POST /ops`:

1. Open dataset without an active lease token.
2. Make an edit and save.
3. Expected:
   - first append gets `428` lease token required
   - client acquires/refreshes lease and retries once
   - append succeeds and pending ops clear

### 4) Lease conflict

1. Acquire a lease as user A.
2. Attempt to save as user B.
3. Expected:
   - `409` lease conflict
   - UI indicates lease conflict (holderSub)

### 5) Revision conflict (discard + reload)

To simulate:
- In Window A, make changes but do not save yet.
- In Window B, save changes first.
- Now save in Window A.

Expected:
- `POST /ops` returns `409 REVISION_CONFLICT`
- Client discards local pending ops and reloads snapshot
- UI indicates remote changed / local edits could not be applied

### 6) Offline / reconnect

1. Open remote dataset.
2. Disable network for ~10 seconds.
3. Re-enable network.

Expected:
- Sync chip shows disconnected/idle while offline.
- On reconnect:
  - catch-up (`GET /ops?fromRevision=…`) runs
  - Sync returns to Live.

## Useful debugging tips

- Use the diagnostics dialog (Sync chip click) to see:
  - pending ops count
  - revisions
  - lease token presence
- If SSE appears connected but updates do not arrive:
  - verify server stream endpoint returns `text/event-stream`
  - verify auth token is valid (fetch-stream uses Authorization header)
