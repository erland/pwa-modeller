# Phase 2 client plan (Plan B) — pwa-modeller

This plan upgrades `pwa-modeller`’s remote dataset mode to fully support **Phase 2** behavior as implemented in the current `java-modeller-server` codebase (the Phase 2 + Phase 2.1 server zip you provided).

It is written so that a **new chat** (with only this repo zip) can implement the client changes and still match the **exact server API paths, headers, status codes, and response shapes**.

## Scope

Client-side capabilities to implement:

- **Validation policy support**
  - choose policy when creating datasets
  - show server validation errors on save (`VALIDATION_FAILED`)
- **Lease (soft-lock) support**
  - acquire / refresh / release
  - send `X-Lease-Token` for writes when you are the lease holder
  - handle lease conflicts (`409` with lease conflict body)
  - support **Owner force override** (`?force=true`) with explicit UX
- **Head polling**
  - periodically call `/datasets/{id}/head` while dataset is open
  - detect remote changes early and warn before a save collides
- **History + restore**
  - list history items
  - restore a revision (optional restore message)
  - refresh local store from server after restore

Out of scope (nice-to-haves):

- realtime presence indicators
- automatic merge
- full diff rendering

---

## Server API contract (must match)

All paths are relative to `{baseUrl}` (the server base url stored in remote settings / registry).

### Dataset metadata

- `GET /datasets`
  - returns an array or `{ items: […] }` (client already handles both)
  - items are shaped like `DatasetResponse` (server uses `id`, not `datasetId`):
    - `id: uuid`
    - `name: string`
    - `description: string|null`
    - `createdAt, updatedAt, archivedAt, deletedAt: ISO date-time or null`
    - `createdBy, updatedBy: string|null`
    - `currentRevision: number`
    - `validationPolicy: "none"|"basic"|"strict"`
    - `status: "ACTIVE"|"ARCHIVED"|"DELETED"`
    - `role: "OWNER"|"EDITOR"|"VIEWER"` (effective role for current user)

- `POST /datasets`
  - request body:
    - `{ "name": string, "description": string|null, "validationPolicy"?: "none"|"basic"|"strict" }`
  - if `validationPolicy` is omitted it defaults to `"none"`
  - invalid `validationPolicy` → `400` (text body; not ApiError)

### Latest snapshot (Phase 1 + Phase 2)

- `GET /datasets/{datasetId}/snapshot`
  - returns JSON `SnapshotResponse`:
    - `{ datasetId, revision, savedAt, savedBy, updatedAt, updatedBy, schemaVersion, payload }`
  - response header: `ETag: "<token>"`
  - if no snapshot exists:
    - `revision = 0`, `ETag: "0"`
    - payload contains at least `{ "model": {} }` (server-generated default)

- `PUT /datasets/{datasetId}/snapshot`
  - query: `?force=true` (optional, Owner-only override of another user’s lease)
  - headers:
    - `If-Match: "<etag>"` (required; first write uses `"0"`)
    - `X-Lease-Token: <token>` (required *only* when you are the active lease holder)
  - body: the modeller payload JSON (whatever you store in `state.model`)
  - success:
    - `200` with `SnapshotResponse`
    - header: `ETag: "<newRevisionAsString>"`
  - errors:
    - missing `If-Match` → `428` with JSON:
      - `{ "error": "precondition_required", "message": "Missing If-Match header" }`
    - stale `If-Match` → `409` with JSON `SnapshotConflictResponse` + `ETag` header:
      - `{ datasetId, currentRevision, currentEtag, savedAt, savedBy, updatedAt, updatedBy }`
      - (`savedAt/savedBy` are populated for backwards compatibility; prefer `updatedAt/updatedBy`)
    - lease held by someone else:
      - without `force=true` → `409` with JSON `LeaseConflictResponse`:
        - `{ datasetId, holderSub, expiresAt }`
      - with `force=true`:
        - if role != OWNER → `403`
        - if role == OWNER → proceed (still must pass `If-Match` checks)
    - lease held by you but missing/invalid token → `428` with JSON `ApiError`:
      - `{ timestamp, status:428, code:"LEASE_TOKEN_REQUIRED", message, path, requestId }`
    - validation fails → `400` with JSON `ApiError`:
      - `{ …, status:400, code:"VALIDATION_FAILED", message, validationErrors:[{severity, rule, path, message}] }`

### Leases (Phase 2)

- `POST /datasets/{datasetId}/lease`
  - acquire lease if none/expired, or refresh if held by caller
  - requires role >= EDITOR
  - success `200` with JSON `DatasetLeaseResponse` (includes token):
    - `{ datasetId, active:true, holderSub, acquiredAt, renewedAt, expiresAt, leaseToken }`
  - conflict `409` with JSON `LeaseConflictResponse`:
    - `{ datasetId, holderSub, expiresAt }`

- `GET /datasets/{datasetId}/lease`
  - requires role >= VIEWER
  - `200` with:
    - active lease → `{ …, active:true, holderSub, acquiredAt, renewedAt, expiresAt, leaseToken:null }`
    - no/expired lease → `{ datasetId, active:false }`

- `DELETE /datasets/{datasetId}/lease`
  - requires role >= EDITOR
  - holder can release; OWNER can release; others `403`
  - always returns `204`

### Head polling (Phase 2)

- `GET /datasets/{datasetId}/head`
  - requires role >= VIEWER
  - returns `DatasetHeadResponse` + `ETag` header:
    - `{ datasetId, currentRevision, currentEtag, updatedAt, updatedBy, validationPolicy, archivedAt, deletedAt, leaseActive, leaseHolderSub?, leaseExpiresAt? }`

### History + restore (Phase 2 + 2.1)

- `GET /datasets/{datasetId}/snapshots?limit=…&offset=…`
  - returns:
    - `{ datasetId, items: [{ revision, etag, savedAt, savedBy, schemaVersion }] }`
  - NOTE: server stores additional history metadata (payloadBytes/savedAction/savedMessage) in DB, but **does not expose** it in this endpoint today. Client must not rely on those fields.

- `POST /datasets/{datasetId}/snapshots/{revision}/restore?force=true`
  - headers: same as snapshot write (`If-Match` required; `X-Lease-Token` required if caller is lease holder)
  - body (optional): `{ "message": "…" }`
  - success `200` with `SnapshotResponse` + new `ETag`
  - errors follow the same patterns as snapshot PUT:
    - `428` missing If-Match
    - `409` stale If-Match (SnapshotConflictResponse + ETag)
    - `409` lease held by someone else (LeaseConflictResponse) unless Owner force override
    - `400` VALIDATION_FAILED

---

## Step-by-step implementation plan

### Step 1 — Extend the API layer to cover Phase 2 endpoints

**Goal:** centralize HTTP calls and define types that match the server contract above.

**Primary files**
- `src/store/remoteDatasetApi.ts` (existing) — extend
- Optionally add: `src/store/remoteDatasetApiPhase2.ts` if you prefer to keep Phase 1 functions stable

**Work**
1. Add/extend types:
   - `ValidationPolicy = "none" | "basic" | "strict"`
   - `Role = "VIEWER" | "EDITOR" | "OWNER"`
   - `ApiError` (matching server’s envelope)
   - `LeaseConflictResponse`
   - `DatasetLeaseResponse`
   - `DatasetHeadResponse`
   - `SnapshotConflictResponse`
   - `SnapshotHistoryResponse` + item type
2. Extend `createRemoteDataset(…)` to accept optional `validationPolicy`.
3. Add wrappers:
   - `getDatasetHead(datasetId)`
   - `acquireOrRefreshLease(datasetId)`
   - `getLeaseStatus(datasetId)`
   - `releaseLease(datasetId)`
   - `listSnapshotHistory(datasetId, { limit, offset })`
   - `restoreSnapshotRevision(datasetId, revision, { message? }, { ifMatch, leaseToken?, force? })`
4. Do **not** add a wrapper for snapshot PUT here yet (that logic currently lives in `RemoteDatasetBackend.persistState`). Step 4 will adapt it, but it can use helper functions/types from this module.

**Deliverables**
- TypeScript types aligned with server responses.
- API wrappers compiled.

**Verify**
- `npm run build`

---

### Step 2 — Introduce a per-dataset “remote session” state (etag + lease + role)

**Goal:** store Phase 2 state that must not be persisted (lease token) and must be shared between head polling, autosave, and UI.

**Primary files**
- `src/store/backends/remoteDatasetBackend.ts` (existing)
- Add: `src/store/remoteSession/remoteDatasetSession.ts` (recommended new module)

**Work**
1. Implement a small in-memory store keyed by local `datasetId`:
   - `lastSeenEtag` (quoted string, from ETag header)
   - `leaseToken?: string` (in-memory only)
   - `leaseExpiresAt?: string` (ISO string)
   - `leaseHolderSub?: string`
   - `myRole?: Role` (from dataset list item’s `role` field; see Step 3)
2. Provide helpers:
   - `getSession(datasetId)`, `setLastSeenEtag(datasetId, etag)`
   - `setLease(datasetId, { leaseToken, expiresAt, holderSub })`, `clearLease(datasetId)`
   - `setMyRole(datasetId, role)`
3. Wire ETag handling:
   - Keep the existing `etagsByDatasetId` map, but route through the session helper (single source of truth).

**Deliverables**
- Session module with clear API.
- No UI changes yet.

**Verify**
- `npm run build`

---

### Step 3 — Acquire/refresh/release leases based on dataset open/close lifecycle

**Goal:** when a remote dataset is opened for editing, acquire a lease; refresh periodically; release when switching away.

**Primary files**
- `src/store/datasetLifecycle.ts` (controls openDataset)
- `src/store/getRemoteDatasetBackend.ts` or `src/store/getDefaultDatasetBackend.ts` (backend selection)
- `src/store/backends/remoteDatasetBackend.ts` (where persist happens)
- `src/store/remoteDatasetApi.ts` (lease wrappers from Step 1)

**Work**
1. Role awareness:
   - On `listRemoteDatasets()`, capture `role` and store it in registry or remote session.
   - The server already returns `role` in dataset list items; use that as `myRole` (no need to call `/me` + ACL unless you decide to).
2. Implement open/close hooks:
   - In `datasetLifecycle.openDataset(…)`, before switching datasets, detect previous `activeDatasetId` and if it is remote, call `releaseLease(…)` and stop timers.
   - After opening a remote dataset:
     - if `myRole` is `EDITOR` or `OWNER`, call `POST /lease` and store `leaseToken/expiresAt`.
     - if `VIEWER`, skip acquiring lease (read-only).
3. Implement refresh timer:
   - Choose refresh period as `min( ttlSeconds*0.6 , 120s )` (you won’t know `ttlSeconds` from server; treat it as 300s default and refresh every 180s).
   - On refresh:
     - call `POST /lease`
     - if returns `409` lease conflict → stop refresh, clear lease token, enter “lease conflict” UI state (Step 6)
4. Ensure cleanup:
   - on dataset switch
   - on app unload (best-effort): `window.addEventListener("beforeunload", …)` to attempt `DELETE /lease`

**Deliverables**
- Lease token appears for editing sessions.
- Lease is released on dataset switch.

**Verify**
- `npm run build`
- Manual: open remote dataset → network shows `POST /lease` and periodic refreshes.

---

### Step 4 — Enforce leases on snapshot writes (headers + error handling + force)

**Goal:** keep optimistic concurrency (`If-Match`) and add lease enforcement and Phase 2 error handling.

**Primary files**
- `src/store/backends/remoteDatasetBackend.ts` (persistState)
- `src/components/shell/RemoteDatasetConflictDialog.tsx` (existing conflict UI)
- Add: `src/components/shell/LeaseConflictDialog.tsx` (Step 6)
- Add: `src/components/shell/ValidationErrorsDialog.tsx` (Step 5)

**Work**
1. When persisting (`persistState`):
   - always send `If-Match` as today
   - if session has `leaseToken`, add header `X-Lease-Token`
   - if “force save” was requested by UI, add `?force=true` to the snapshot PUT URL
2. Handle responses deterministically:
   - `409` with lease conflict body:
     - detect by presence of `holderSub` + `expiresAt` and absence of `currentRevision`
     - surface lease conflict UI (Step 6)
   - `409` with snapshot conflict body:
     - parse `updatedAt/updatedBy/currentRevision/currentEtag` (fallback to `savedAt/savedBy`)
     - keep existing conflict UI, but show richer fields (Step 8)
   - `428`:
     - if JSON has `{error:"precondition_required"}` → map to PRECONDITION_REQUIRED (existing)
     - else if JSON has `code:"LEASE_TOKEN_REQUIRED"` → treat as lease-token problem:
       - attempt one `POST /lease` reacquire and retry save once
       - if still fails, show lease dialog
   - `400` `VALIDATION_FAILED` → show validation dialog (Step 5)
3. Update `RemoteDatasetBackendError` to carry:
   - `serverUpdatedAt/serverUpdatedBy`
   - `leaseConflictHolderSub/leaseConflictExpiresAt`
   - `validationErrors[]` (for VALIDATION_FAILED)
   so UI can render without re-parsing.

**Deliverables**
- Autosave writes include token when required.
- Conflicts/validation failures produce actionable UI instead of generic error.

**Verify**
- `npm run build`
- Manual: with an active lease, saving works; without token, server returns 428 and client recovers.

---

### Step 5 — Validation policy UI + validation errors dialog

**Goal:** let user choose validation policy and understand validation failures.

**Primary files**
- `src/components/model/datasets/RemoteDatasetsDialog.tsx` (create remote dataset UI)
- `src/store/remoteDatasetApi.ts` (createRemoteDataset adds validationPolicy)
- Add: `src/components/shell/ValidationErrorsDialog.tsx`

**Work**
1. Add a dropdown in the “create dataset” flow:
   - values: `none`, `basic`, `strict`
   - default: `none`
2. Pass `validationPolicy` to server in `createRemoteDataset`.
3. Implement `ValidationErrorsDialog` to show `validationErrors` from `ApiError`.
   - show `severity` + `rule` + optional `path` + `message`
   - include “Copy JSON” action for reporting

**Deliverables**
- New datasets can be created with `basic/strict`.
- Validation failures show a deterministic list.

**Verify**
- `npm run build`
- Manual: set dataset to `basic`, attempt save payload without `schemaVersion` → dialog appears.

---

### Step 6 — Lease conflict UX (locked by another user)

**Goal:** provide clear UX when `POST /lease` or save returns `409 LeaseConflictResponse`.

**Primary files**
- Add: `src/components/shell/LeaseConflictDialog.tsx`
- Integrate where remote errors are shown (search for `RemoteDatasetBackendError` usage)

**Work**
1. Dialog inputs:
   - `holderSub`, `expiresAt`
   - `myRole` (to show force options only for OWNER)
2. Actions:
   - “Open read-only” → clear local lease state and disable autosave (keep polling/head)
   - “Retry” → retry `POST /lease`
   - If OWNER: “Force save” → triggers save retry with `?force=true` (Step 10)
3. Integrate:
   - show dialog on lease conflict from acquire/refresh
   - show dialog on lease conflict from save

**Deliverables**
- User can continue read-only or retry later.

**Verify**
- Manual: open same dataset in two browsers; second browser sees conflict dialog.

---

### Step 7 — Head polling for early remote-change detection

**Goal:** detect remote updates before save collides, and surface “remote changed” prompt.

**Primary files**
- `src/store/backends/remoteDatasetBackend.ts` (or the session module from Step 2)
- Add: `src/components/shell/RemoteChangedDialog.tsx` (recommended)

**Work**
1. Start polling when remote dataset is open (VIEWER+):
   - every 10–30 seconds call `GET /datasets/{id}/head`
2. Compare:
   - if `head.currentEtag` differs from `lastSeenEtag` and local is dirty:
     - show a “Remote changed” dialog:
       - “Reload from server” (call `loadPersistedState` and re-hydrate)
       - “Keep local” (continue; next save may conflict)
3. Also use head response to:
   - show lease badge (optional)
   - notice lease expired (leaseActive false while session had token) → clear token and attempt reacquire (EDITOR+)

**Deliverables**
- proactive remote-change prompt.

**Verify**
- Manual: change dataset from another client; first client warns.

---

### Step 8 — Use enriched snapshot conflict fields

**Goal:** display server’s richer conflict payload.

**Primary files**
- `src/store/backends/remoteDatasetBackend.ts` (conflict parsing)
- `src/components/shell/RemoteDatasetConflictDialog.tsx` (UI)

**Work**
- Prefer `updatedAt/updatedBy/currentRevision/currentEtag`
- Fallback to `savedAt/savedBy`

**Deliverables**
- conflict dialog shows “changed by/when” plus revision/etag.

**Verify**
- Manual: trigger stale If-Match and confirm dialog fields.

---

### Step 9 — History UI + restore (with optional message)

**Goal:** implement list + restore using the server endpoints.

**Primary files**
- Add: `src/components/model/datasets/DatasetHistoryDialog.tsx`
- Extend API: `listSnapshotHistory`, `restoreSnapshotRevision`

**Work**
1. List:
   - call `GET /datasets/{id}/snapshots?limit=50&offset=0`
   - render rows: `revision`, `savedAt`, `savedBy`, `schemaVersion`
2. Restore:
   - user selects a revision and optionally types message
   - call:
     - `POST /datasets/{id}/snapshots/{rev}/restore`
     - headers:
       - `If-Match: <currentEtag>` (quoted)
       - `X-Lease-Token` if session has token
     - body: `{ "message": "…" }` or `{}` (send `{}` to keep JSON content-type stable)
   - after success:
     - update `lastSeenEtag` from response header
     - reload latest snapshot (`GET /snapshot`) and hydrate store

**Deliverables**
- history list + restore works end-to-end.

**Verify**
- Manual: restore revision 1 and observe store reload.

---

### Step 10 — Owner-only force override UX (`force=true`)

**Goal:** allow OWNER to bypass another user’s active lease explicitly (audited by server).

**Primary files**
- Where you compute/store `myRole` (Step 3)
- Where lease conflict dialog is shown (Step 6)
- Where snapshot PUT / restore is called (Steps 4, 9)

**Work**
1. Only enable force buttons when `myRole === "OWNER"`.
2. Force save:
   - retry snapshot PUT to `/snapshot?force=true`
3. Force restore:
   - call restore endpoint with `?force=true`
4. UX copy must clearly say:
   - “This overrides another user’s lease and will be audited.”

**Deliverables**
- OWNER can force save/restore; non-owners cannot.

**Verify**
- Manual: as OWNER, when dataset leased by other user, force save succeeds.

---

### Step 11 — Client docs + verification notes

**Goal:** make Phase 2 behavior discoverable for developers.

**Work**
- Add `docs/phase2-client-notes.md` summarizing:
  - lease lifecycle + timers
  - head polling
  - validation policy + errors
  - history/restore
  - force override
- Update `README.md` with:
  - required server endpoints for Phase 2
  - how to run two browsers for multi-user testing

---

## Acceptance checklist

- Create remote dataset with `validationPolicy=basic`
- Open the dataset (Editor):
  - lease acquired and refreshed
  - saving includes `If-Match` + `X-Lease-Token`
- Save invalid payload (missing schemaVersion) → validation dialog shown (VALIDATION_FAILED)
- Open same dataset in second browser:
  - lease conflict dialog shown
  - can open read-only
- Head polling detects remote updates and warns when local dirty
- History dialog lists revisions and restore works with optional message
- Owner can force save/restore with `force=true` (explicit UI)

---

## Step 11 — Client docs + verification notes

Implemented in:

- `docs/phase2-client-implementation-notes.md`
- `docs/phase2-verification-notes.md`
