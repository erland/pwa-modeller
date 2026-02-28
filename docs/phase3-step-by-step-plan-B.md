# Phase 3 Step-by-step plan B — Client (operation-based sync + real-time subscription)

This plan extends the PWA client in this repository from **Phase 2 (snapshot + leases + polling)** to **Phase 3 (operation/command-based writes + real-time sync)**.

## Assumptions

- Phase 2 client functionality (leases, validation dialogs, history/restore, head polling) remains available during migration.
- Phase 3 server (as implemented in `java-modeller-server-phase3-step11-e2e-demo.zip`) exposes:
  - `POST /datasets/{id}/ops` (append ops)
  - `GET /datasets/{id}/ops?fromRevision=…&limit=…` (catch-up)
  - `GET /datasets/{id}/ops/stream?fromRevision=…&limit=…` (SSE stream of `OperationEvent` JSON)
- **SSE authentication:** the server expects standard auth (Bearer token / OIDC). The browser's native `EventSource` cannot set headers.
  - Therefore, the client should implement SSE using a **fetch + ReadableStream** approach (or an EventSource polyfill that supports headers).
- Phase 3 server currently supports only two operation types for materialization:
  - `SNAPSHOT_REPLACE` (payload = full snapshot JSON)
  - `JSON_PATCH` (payload = JSON Patch array subset: add/remove/replace)
  - Rich domain command types (e.g. ADD_ELEMENT / UPDATE_PROP) can be introduced later, but are **not** accepted by the current server.

## Definitions

- **Local revision**: last server revision fully applied to the local model.
- **Pending ops**: local operations not yet accepted by the server.
- **Applied ops**: operations received from server and applied to local model.

## High-level deliverables

- New operation IR and mapping layer from UI actions/mutations → operations.
- New sync engine:
  - send ops (batch)
  - subscribe + apply incoming ops
  - catch up (ops since) on reconnect
- UI indicators and error handling for op conflicts and validation.

---

## Step 1 — Add client API wrappers for Phase 3 ops + SSE

### Changes
- Extend `src/store/remoteDatasetApi.ts` with:
  - `appendOperations(datasetId, req, { leaseToken?, force? })`
  - `getOperationsSince(datasetId, fromRevision, { limit? })`
  - `openDatasetOpsStream(datasetId, { fromRevision?, limit? })` helper that returns an async iterator (or callback unsubscribe) based on **fetch streaming** (not native `EventSource`), so it can include `Authorization` header.

### Deliverables
- Typed DTOs matching server:
  - `AppendOperationsRequest/Response`, `OperationEvent`, `OpsSinceResponse`
  - Error DTOs used by the client:
    - `RevisionConflictResponse` (409)
    - `DuplicateOpIdResponse` (409)
    - `LeaseConflictResponse` (409)
    - `ApiError` (notably `errorCode` is present; used for `LEASE_TOKEN_REQUIRED` on 428)

### Verification
- `npm test` (typecheck/build) and basic unit tests if added.

---

## Step 2 — Introduce “op sync state” per remote dataset

### Changes
- Extend `src/store/remoteDatasetSession.ts` to track:
  - `serverRevision` (number | null)
  - `pendingOps` (queue)
  - `lastAppliedRevision` (number | null)
  - `sseConnected` (boolean)
  - `lastSeenOpId` (optional, for dedupe)

### Deliverables
- Getter/setter helpers + reset helpers for tests.

### Verification
- Unit tests for session state transitions.

---

## Step 3 — Define operation model and mapping from existing mutations

### Changes
Implement Phase 3 operations **as the server supports today**, with an incremental path:

**Phase 3A (minimal, quickest to integrate):**
- Represent a “save” as a single `SNAPSHOT_REPLACE` operation.
- `payload` is exactly the same JSON body you currently PUT to `/snapshot`.

**Phase 3B (better, more efficient):**
- Represent edits as `JSON_PATCH` operations.
- Payload is JSON Patch (subset: `add`, `remove`, `replace`) applied against the latest materialized snapshot.
- If you already have immutable reducers/mutations, you can generate JSON Patch by diffing before/after (careful with determinism).

Suggested folder:
- `src/domain/ops/`:
  - `opsTypes.ts` exporting `SNAPSHOT_REPLACE` and `JSON_PATCH`
  - helpers to build ops with deterministic `opId`
  - (optional) JSON Patch builder utilities

### Deliverables
- Operation definitions + mapper with tests.

### Verification
- Jest tests validating “mutation → op” output is stable.

---

## Step 4 — Apply operations to local model deterministically

### Changes
- Implement `applyOperation(model, op)` in `src/domain/ops/apply/`.
- Ensure it uses the same business rules as mutations (or refactor mutations to call the same underlying domain helpers).

### Deliverables
- `applyOperation` + golden tests.

### Verification
- Tests comparing:
  - applying op yields same state as existing mutation path for representative operations.

---

## Step 5 — Build a Phase 3 sync engine (send + receive + catch-up)

### Changes
- Add `src/store/phase3Sync/remoteOpsSync.ts` (or similar) responsible for:
  - Start/stop per dataset
  - Establish SSE subscription
- On each streamed `OperationEvent` JSON message:
    - apply sequentially (events are ordered by revision)
    - update `serverRevision/lastAppliedRevision`
  - On reconnect:
    - call `getOperationsSince(fromRevision=lastAppliedRevision)`
    - apply missing ops in order

### Deliverables
- Start/stop functions used from `datasetLifecycle.ts`.

### Verification
- Unit tests with a mocked API that:
  - emits ops
  - simulates disconnect and catch-up behavior

---

## Step 6 — Route local edits through the op pipeline

### Changes
- When user edits the model, route through ops:
  - Minimal approach (Phase 3A): on “save” (or debounce), send a single `SNAPSHOT_REPLACE` op.
  - Better approach (Phase 3B): enqueue `JSON_PATCH` ops per mutation (or per debounce window).
  - Send a batch via `appendOperations` with `baseRevision = lastAppliedRevision`.
- On server acceptance:
  - clear pending ops that were accepted
  - advance revision
- On rejection:
  - handle `409 REVISION_CONFLICT` (Step 7)
  - handle `VALIDATION_FAILED` (reuse Step 5 validation dialog)

### Deliverables
- A single “write path” for remote datasets that uses ops, guarded by feature flag.

### Verification
- Manual: edit a remote dataset and see POST /ops being called.

---

## Step 7 — Conflict and replay strategy (revision conflicts)

### Behavior
- If `appendOperations` returns `409 REVISION_CONFLICT`:
  1) Pause outgoing sends
  2) Fetch missing ops since lastAppliedRevision
  3) Apply them
  4) Rebase:
     - Option A (simple): drop local pending ops and ask user to reapply
     - Option B (better): reapply pending ops on top and resend

### Deliverables
- Implement Option A first (simpler, predictable), document.
- Add UX dialog: “Remote changed — your local edits couldn’t be applied; reload or try reapply”.

Also handle `409 DuplicateOpIdResponse` (idempotency):
- If you retry an append and the server reports the op already exists at `existingRevision`, treat it as **success** and advance local tracking accordingly.

### Verification
- Test: simulate conflict and verify client enters consistent state.

---

## Step 8 — Integrate leases (if server requires tokens for ops)

### Changes
The server implementation from this chat **does require lease interaction** for `POST /ops`:
- If an active lease exists and is held by someone else → `409 LeaseConflictResponse`
- If an active lease exists and is held by the caller → requires header `X-Lease-Token`, otherwise `428` with `ApiError.errorCode = LEASE_TOKEN_REQUIRED`
- Optional: `force=true` can bypass a lease held by someone else for OWNER+ (keep this behind an “admin override” UX).

Client work:
- Add `X-Lease-Token` header to `appendOperations`.
- Reuse the existing Phase 2 lease lifecycle to obtain/refresh the token.
- On `LEASE_TOKEN_REQUIRED`: prompt user to acquire/refresh lease; block sends until lease is present.

### Deliverables
- Lease-aware send path.

### Verification
- Manual: open as editor without token → correct dialog.

---

## Step 9 — UI indicators and diagnostics

### Changes
- Add small status indicators in shell:
  - “Live” (SSE connected) / “Reconnecting”
  - Pending ops count
  - Last server revision
- Extend existing persistence status area or add a Phase 3 status line.

### Verification
- Manual: disconnect network and verify reconnect indicators.

---

## Step 10 — Keep Phase 2 snapshot pipeline as fallback (feature flag)

### Changes
- Feature flag (e.g. `remoteOpsSyncEnabled` in config):
  - When enabled: use Phase 3 ops pipeline
  - When disabled: keep current snapshot persistence behavior
- Ensure head polling remains (or becomes optional) when SSE is active.

Compatibility note:
- Phase 2 endpoints continue to exist; Phase 3 can initially just wrap Phase 2-style saves using `SNAPSHOT_REPLACE` ops.
- Server responses may include both `code` and `errorCode` in `ApiError` (tests use `errorCode`).

### Deliverables
- Clean toggle for incremental rollout.

### Verification
- Manual: toggle flag and verify behavior switches.

---

## Step 11 — Update docs + verification notes

### Changes
- Add docs:
  - `docs/phase3-client-implementation-notes.md`
  - `docs/phase3-verification-notes.md`
- Include manual test scripts:
  - two browser windows, subscribe + edit, observe live updates

### Verification commands (quick)

- Install: `npm ci`
- Typecheck/build: `npm run build`
- Tests: `npm test`
- Lint: `npm run lint`
