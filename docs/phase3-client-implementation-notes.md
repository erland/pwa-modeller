# Phase 3 client implementation notes (ops-based remote datasets)

This repo implements **Phase 3 remote datasets** using an **append-only operations log** with **real-time updates via SSE**.

## Base URL note (nginx edge)

If you are running the java-modeller-server demo behind its nginx edge, the PWA should point to a base URL that includes the `/api` prefix (for example `http://localhost:8081/api`). If you expose Quarkus directly without nginx, use the Quarkus base URL (no `/api`).

## High-level behavior

- **Initial open (remote dataset):**
  - Client loads a **materialized snapshot** using `GET /datasets/{id}/snapshot`.
  - Client initializes `serverRevision` and `lastAppliedRevision` to the snapshot's `revision`.
  - Client starts the Phase 3 sync engine:
    - catch-up via `GET /datasets/{id}/ops?fromRevision=lastAppliedRevision+1`
    - subscribe via `GET /datasets/{id}/ops/stream?fromRevision=lastAppliedRevision+1`

- **Local edits (remote dataset):**
  - Local edits are routed into the **pending ops pipeline**.
  - Current implementation uses Phase 3A mapping:
    - remote persistence is expressed as a single `SNAPSHOT_REPLACE` operation containing the full model JSON.
  - Persistence sends `POST /datasets/{id}/ops` with `baseRevision = lastAppliedRevision`.

- **Incoming remote edits:**
  - Streamed operations are applied **sequentially**.
  - `serverRevision` and `lastAppliedRevision` are updated as revisions advance.
  - If the local dataset is dirty when remote updates arrive, the client marks "remote changed" rather than auto-hydrating.

## Lease integration

If the server requires leases for appending operations:

- Client sends `X-Lease-Token` on `POST /ops` when available.
- If server responds with `428` and `ApiError.errorCode = LEASE_TOKEN_REQUIRED`:
  - client attempts to acquire/refresh lease and retries once.
- If server responds with `409` lease conflict:
  - client surfaces a lease conflict state (existing UX can be reused).

## Conflict strategy (revision conflicts)

If `POST /ops` returns `409 REVISION_CONFLICT` (server indicates the base revision is stale):

- Option A (implemented):
  - discard pending local ops
  - reload the latest snapshot (`GET /datasets/{id}/snapshot`)
  - hydrate the store and mark that the remote changed

Duplicate op id (`409 DuplicateOpIdResponse`) is treated as idempotent success.

## Key modules

### API wrappers
- `src/store/remoteDatasetApi.ts`
  - `appendOperations`, `getOperationsSince`, `openDatasetOpsStream`

### Per-dataset session state
- `src/store/remoteDatasetSession.ts`
  - `serverRevision`, `lastAppliedRevision`, `pendingOps`, `sseConnected`, lease token/expires, etc.

### Sync engine
- `src/store/phase3Sync/remoteOpsSync.ts`
  - catch-up + stream subscription
  - applies ops to the local model using `applyOperationDtosToModel`

### Operation model + mapping
- `src/domain/ops/*`
  - operation types (`SNAPSHOT_REPLACE`, `JSON_PATCH`)
  - deterministic op ids
  - Phase 3A mapping helpers

### Applying operations
- `src/store/phase3Ops/applyOperation.ts`
  - applies `SNAPSHOT_REPLACE` and a JSON Patch subset deterministically

### UI indicators
- `src/components/shell/AppShell.tsx`
- `src/components/shell/RemoteOpsDiagnosticsDialog.tsx`

## Known limitations / next improvements

- Current mapping is **Phase 3A** (snapshot replace). It is correct but not bandwidth-optimal.
- A future Phase 3B can generate `JSON_PATCH` payloads per mutation/debounce window.
- Real-world conflict UX can be improved (e.g., offer reapply/rebase rather than discard).
