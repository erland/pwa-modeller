# Phase 3 Step-by-step plan B — Client (operation-based sync + real-time subscription)

This plan extends the PWA client in this repository from **Phase 2 (snapshot + leases + polling)** to **Phase 3 (operation/command-based writes + real-time sync)**.

## Assumptions

- Phase 2 client functionality (leases, validation dialogs, history/restore, head polling) remains available during migration.
- Phase 3 server exposes:
  - `POST /datasets/{id}/ops`
  - `GET /datasets/{id}/ops?fromRevision=...`
  - `GET /datasets/{id}/events` (SSE)
- Client will implement SSE first; WebSocket can follow later if needed.
- The client can represent edits as deterministic operations by reusing existing mutation actions.

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
  - `openDatasetEventsSse(datasetId)` helper that returns an `EventSource` (or wraps it)

### Deliverables
- Typed DTOs matching server:
  - `AppendOperationsRequest/Response`, `OperationEvent`, `OpsSinceResponse`

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
- Add `src/domain/ops/`:
  - operation type registry (e.g. `ADD_ELEMENT`, `UPDATE_PROP`, `DELETE_RELATIONSHIP`, etc.)
  - payload schemas (typed)
- Add mapping layer:
  - from existing store mutation calls to op objects
  - ensure each op is deterministic and serializable

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
  - On SSE `op` event:
    - if op revision > local revision: apply sequentially
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
- When user edits the model (existing mutation calls), instead of immediately snapshot-saving:
  - Create op(s)
  - Enqueue into `pendingOps`
  - Optimistically apply locally (optional but recommended for responsiveness)
  - Send batch via `appendOperations` referencing `baseRevision`
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

### Verification
- Test: simulate conflict and verify client enters consistent state.

---

## Step 8 — Integrate leases (if server requires tokens for ops)

### Changes
- If Phase 3 policy still requires lease token:
  - Add `X-Lease-Token` to `appendOperations`
  - Reuse existing lease lifecycle (Step 3 from Phase 2) to keep token valid
  - If `LEASE_TOKEN_REQUIRED`, open lease conflict UX and block sends

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
