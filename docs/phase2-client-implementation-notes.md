# Phase 2 client implementation notes (pwa-modeller)

This repo includes client-side support for the **Phase 2 remote dataset contract** (leases, head polling, validation, history/restore, force override).

These notes are meant as a quick “where is it implemented?” index for future refactors and troubleshooting.

## Feature → code map

### API wrapper (all Phase 2 endpoints + types)
- `src/store/remoteDatasetApi.ts`
  - Phase 2 types: `ValidationPolicy`, `Role`, `DatasetHeadResponse`, `DatasetLeaseResponse`, `SnapshotConflictResponse`, `SnapshotHistoryResponse`, etc.
  - API calls: `getDatasetHead`, `acquireOrRefreshLease`, `getLeaseStatus`, `releaseLease`, `listSnapshotHistory`, `restoreSnapshotRevision`
  - Typed error: `RemoteDatasetApiError` (status/body/etag)

### Per-dataset remote session state (in-memory)
- `src/store/remoteDatasetSession.ts`
  - Tracks per-remote-dataset:
    - `lastSeenEtag`
    - `role`
    - `leaseToken`, `leaseExpiresAt`
    - `leaseConflict`
    - `lastWarnedHeadEtag` (to avoid repeated “remote changed” prompts)

### Remote backend (ETag + lease headers + error decoding)
- `src/store/backends/remoteDatasetBackend.ts`
  - Adds `X-Lease-Token` on snapshot writes when token exists
  - Supports force write (`?force=true`) via `persistStateWithOptions(…, { force:true })`
  - Decodes Phase 2 responses into typed `RemoteDatasetBackendError` codes:
    - `LEASE_CONFLICT`, `LEASE_TOKEN_REQUIRED`, `VALIDATION_FAILED`, `CONFLICT`

### Dataset lifecycle (open/close timers)
- `src/store/datasetLifecycle.ts`
  - Lease lifecycle:
    - acquire on open (EDITOR/OWNER)
    - refresh timer while open
    - release on close/switch (best-effort)
  - Head polling:
    - `GET /datasets/{id}/head` while remote dataset is open (VIEWER+)
    - warns when remote changed while local is dirty
    - auto-reloads when local is clean (best-effort)
  - Helper: `retryAcquireLeaseForDataset(…)` used by the lease conflict dialog

### Dialogs / UX surfaced in the shell
- Lease conflict:
  - `src/components/shell/LeaseConflictDialog.tsx`
  - wired from `src/components/shell/AppShell.tsx`
- Validation errors:
  - `src/components/shell/RemoteDatasetValidationErrorsDialog.tsx`
  - wired from `src/components/shell/AppShell.tsx`
- Snapshot conflict (enriched fields shown):
  - `src/components/shell/RemoteDatasetConflictDialog.tsx`
- Remote changed prompt (from head polling):
  - `src/components/shell/RemoteChangedDialog.tsx`

### Dataset list/create/history UI
- `src/components/model/datasets/RemoteDatasetsDialog.tsx`
  - validation policy selector at create time
  - history dialog integration
- `src/components/model/datasets/RemoteDatasetHistoryDialog.tsx`
  - list revisions, optional restore message, owner-only force restore
- `src/components/model/datasets/useRemoteDatasetsDialogModel.ts`
  - wires list/create/open/history/restore and uses remote session role/token

## Behavioral notes

- Lease acquisition is attempted only for role `EDITOR`/`OWNER`.
- Snapshot writes:
  - send `If-Match` (as before)
  - send `X-Lease-Token` when available
- Force override:
  - only exposed for `OWNER`
  - requires explicit confirmation before enabling the button
- Head polling:
  - runs while the remote dataset is open
  - if remote changes and local is dirty → prompt
  - if remote changes and local is clean → auto-reload (best-effort)

