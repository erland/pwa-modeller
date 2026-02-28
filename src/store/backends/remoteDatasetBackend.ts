import type { DatasetBackend, PersistedStoreSlice } from '../datasetBackend';
import type { DatasetId } from '../datasetTypes';
import { loadDatasetRegistry } from '../datasetRegistry';
import { loadRemoteDatasetSettings } from '../remoteDatasetSettings';
import {
  getLastSeenEtag as getSessionEtag,
  getLeaseToken as getSessionLeaseToken,
  setLeaseConflict as setSessionLeaseConflict,
  setLeaseExpiresAt as setSessionLeaseExpiresAt,
  setLeaseToken as setSessionLeaseToken,
  getPendingOps,
  setLastSeenEtag as setSessionEtag,
  setPendingOps,
  setLastAppliedRevision,
  setServerRevision
} from '../remoteDatasetSession';
import { remoteOpsSync } from '../phase3Sync';
import { snapshotReplaceDtoFromModel } from '../phase3Ops/mapToOperationDto';
import { getAccessToken } from '../../auth/oidcPkceAuth';
import {
  acquireOrRefreshLease,
  RemoteDatasetApiError,
  type LeaseConflictResponse,
  type ValidationError
} from '../remoteDatasetApi';

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export type RemoteDatasetRef = {
  baseUrl: string;
  serverDatasetId: string;
};

export type RemoteSnapshotResponse = {
  datasetId: string;
  revision: number;
  payload: unknown;
  savedAt?: string;
  savedBy?: string;
};

export class RemoteDatasetBackendError extends Error {
  public readonly code:
    | 'REMOTE_REF_MISSING'
    | 'AUTH_MISSING'
    | 'AUTH_FAILED'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'LEASE_CONFLICT'
    | 'PRECONDITION_REQUIRED'
    | 'LEASE_TOKEN_REQUIRED'
    | 'VALIDATION_FAILED'
    | 'HTTP_ERROR'
    | 'INVALID_RESPONSE';

  public readonly status?: number;
  public readonly responseEtag?: string | null;
  /** Optional conflict UX support data (best-effort). */
  public readonly serverSavedAt?: string | null;
  /** Optional conflict UX support data (best-effort). */
  public readonly serverSavedBy?: string | null;
  /** Optional conflict UX support data (best-effort). */
  public readonly serverUpdatedAt?: string | null;
  /** Optional conflict UX support data (best-effort). */
   public readonly serverUpdatedBy?: string | null;
  /** Optional conflict UX support data: server current revision number (best-effort). */
  public readonly serverRevision?: number | null;
  /** Optional lease conflict UX support data (best-effort). */
  public readonly leaseHolderSub?: string | null;
  /** Optional lease conflict UX support data (best-effort). */
  public readonly leaseExpiresAt?: string | null;
  /** For ApiError bodies. */
  public readonly apiCode?: string | null;
  public readonly validationErrors?: ValidationError[] | null;

  constructor(
    message: string,
    code: RemoteDatasetBackendError['code'],
    opts?: {
      status?: number;
      responseEtag?: string | null;
      serverSavedAt?: string | null;
      serverSavedBy?: string | null;
      serverUpdatedAt?: string | null;
      serverUpdatedBy?: string | null;
      serverRevision?: number | null;
      leaseHolderSub?: string | null;
      leaseExpiresAt?: string | null;
      apiCode?: string | null;
      validationErrors?: ValidationError[] | null;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'RemoteDatasetBackendError';
    this.code = code;
    this.status = opts?.status;
    this.responseEtag = opts?.responseEtag ?? null;
    this.serverSavedAt = opts?.serverSavedAt ?? null;
    this.serverSavedBy = opts?.serverSavedBy ?? null;
    this.serverUpdatedAt = opts?.serverUpdatedAt ?? null;
    this.serverUpdatedBy = opts?.serverUpdatedBy ?? null;
    this.serverRevision = opts?.serverRevision ?? null;
    this.leaseHolderSub = opts?.leaseHolderSub ?? null;
    this.leaseExpiresAt = opts?.leaseExpiresAt ?? null;
    this.apiCode = opts?.apiCode ?? null;
    this.validationErrors = opts?.validationErrors ?? null;
    // Preserve original error where supported.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).cause = opts?.cause;
  }
}



function getRemoteRefForDataset(datasetId: DatasetId): RemoteDatasetRef | null {
  const reg = loadDatasetRegistry();
  const entry = reg?.entries?.find(e => e.datasetId === datasetId);
  if (!entry || entry.storageKind !== 'remote') return null;
  if (!entry.remote?.baseUrl || !entry.remote?.serverDatasetId) return null;
  return {
    baseUrl: entry.remote.baseUrl,
    serverDatasetId: entry.remote.serverDatasetId
  };
}

/**
 * Phase 1 remote backend.
 *
 * Step 2: implements loadPersistedState via GET /datasets/{id}/snapshot.
 *
 * Note: We intentionally keep ETag handling inside this backend instance.
 * Later steps will use it when persisting with If-Match.
 */
export class RemoteDatasetBackend implements DatasetBackend {
  public readonly kind = 'remote' as const;

  /** Returns the last seen ETag (including quotes) for the dataset, if any. */
  public getLastSeenEtag(datasetId: DatasetId): string | null {
    return getSessionEtag(datasetId);
  }

  /** Allows tests / later steps to set the ETag explicitly. */
  public _setLastSeenEtag(datasetId: DatasetId, etag: string): void {
    setSessionEtag(datasetId, etag);
  }

  async loadPersistedState(datasetId: DatasetId): Promise<PersistedStoreSlice | null> {
    const remoteRef = getRemoteRefForDataset(datasetId);
    if (!remoteRef) {
      throw new RemoteDatasetBackendError(
        `Remote dataset reference missing for datasetId '${datasetId}'.`,
        'REMOTE_REF_MISSING'
      );
    }

    // Prefer PKCE session tokens. Keep legacy pasted token as fallback.
    const token = (await getAccessToken()) ?? loadRemoteDatasetSettings().remoteAccessToken ?? '';
    if (!token.trim()) throw new RemoteDatasetBackendError('Not signed in (no access token).', 'AUTH_MISSING');

    const baseUrl = normalizeBaseUrl(remoteRef.baseUrl);
    if (!baseUrl) {
      throw new RemoteDatasetBackendError('Remote server baseUrl is missing.', 'REMOTE_REF_MISSING');
    }

    const url = `${baseUrl}/datasets/${encodeURIComponent(remoteRef.serverDatasetId)}/snapshot`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
    } catch (e) {
      throw new RemoteDatasetBackendError('Remote snapshot request failed.', 'HTTP_ERROR', { cause: e });
    }

    if (res.status === 404) {
      throw new RemoteDatasetBackendError('Remote dataset not found or no access.', 'NOT_FOUND', { status: 404 });
    }
    if (res.status === 401 || res.status === 403) {
      throw new RemoteDatasetBackendError('Remote authorization failed.', 'AUTH_FAILED', { status: res.status });
    }
    if (!res.ok) {
      throw new RemoteDatasetBackendError(`Remote snapshot request failed (${res.status}).`, 'HTTP_ERROR', { status: res.status });
    }

    const etag = res.headers.get('ETag');
    if (etag) setSessionEtag(datasetId, etag);

    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      throw new RemoteDatasetBackendError('Remote snapshot response was not valid JSON.', 'INVALID_RESPONSE', { cause: e });
    }

    const resp = body as RemoteSnapshotResponse | null;
    // Step 2 assumption: server wraps the modeller model in { payload }.
    const payload = resp?.payload;
    // Phase 3: initialize revision trackers from snapshot.
    if (typeof resp?.revision === 'number') {
      setServerRevision(datasetId, resp.revision);
      setLastAppliedRevision(datasetId, resp.revision);
    }

    return {
      model: (payload as PersistedStoreSlice['model']) ?? null,
      fileName: null,
      isDirty: false
    };
  }

  async persistState(datasetId: DatasetId, state: PersistedStoreSlice): Promise<void> {
    await this.persistStateWithOptions(datasetId, state, {});
  }

  /**
   * Phase 2: snapshot writes can optionally use the Owner-only force override.
   * Step 4 implements the request semantics; Step 10 adds the explicit UX.
   */
  async persistStateWithOptions(
    datasetId: DatasetId,
    state: PersistedStoreSlice,
    opts: { force?: boolean } = {}
  ): Promise<void> {
    const remoteRef = getRemoteRefForDataset(datasetId);
    if (!remoteRef) {
      throw new RemoteDatasetBackendError(
        `Remote dataset reference missing for datasetId '${datasetId}'.`,
        'REMOTE_REF_MISSING'
      );
    }

    // Prefer PKCE session tokens. Keep legacy pasted token as fallback.
    const token = (await getAccessToken()) ?? loadRemoteDatasetSettings().remoteAccessToken ?? '';
    if (!token.trim()) throw new RemoteDatasetBackendError('Not signed in (no access token).', 'AUTH_MISSING');

    const baseUrl = normalizeBaseUrl(remoteRef.baseUrl);
    if (!baseUrl) {
      throw new RemoteDatasetBackendError('Remote server baseUrl is missing.', 'REMOTE_REF_MISSING');
    }

    // -----------------------------
    // Ops-based persistence (Phase 3)
        // Ensure we have at least one pending op representing the latest local state.
        // (Edits routed through ModelStore.updateModel should already do this.)
        const pending = getPendingOps(datasetId);
        if (pending.length === 0 && state.model) {
          setPendingOps(datasetId, [snapshotReplaceDtoFromModel(state.model)]);
        }
    
        let leaseToken = (getSessionLeaseToken(datasetId) ?? '').trim();
    
        // Step 8: leases may be required for ops writes. If we don't currently have a token,
        // attempt to acquire/refresh a lease best-effort before flushing.
        if (!leaseToken) {
          try {
            const { lease } = await acquireOrRefreshLease(remoteRef.serverDatasetId);
            if (lease.active && lease.leaseToken) {
              setSessionLeaseToken(datasetId, lease.leaseToken);
              setSessionLeaseExpiresAt(datasetId, lease.expiresAt);
              setSessionLeaseConflict(datasetId, null);
              leaseToken = lease.leaseToken;
            }
          } catch (e) {
            if (e instanceof RemoteDatasetApiError && e.status === 409) {
              const body = e.body as LeaseConflictResponse | undefined;
              setSessionLeaseToken(datasetId, null);
              setSessionLeaseExpiresAt(datasetId, null);
              setSessionLeaseConflict(datasetId, (body as any) ?? null);
            }
            // Ignore other failures; flushPending will surface meaningful errors.
          }
        }
        try {
          await remoteOpsSync.flushPending(datasetId, remoteRef.serverDatasetId, {
            leaseToken: leaseToken || null,
            force: opts.force
          });
          return;
        } catch (e) {
          // Keep backward-compatible error mapping for callers/UI.
          if (e instanceof RemoteDatasetApiError) {
            if (e.status === 409) {
              const body = e.body as any;
              if (body && typeof body.holderSub === 'string') {
                throw new RemoteDatasetBackendError('Remote lease conflict.', 'LEASE_CONFLICT', {
                  status: 409,
                  leaseHolderSub: body.holderSub
                });
              }
            }
            if (e.status === 400) {
              const body = e.body as any;
              const apiCode = typeof body?.errorCode === 'string' ? body.errorCode : null;
              if (apiCode === 'VALIDATION_FAILED') {
                throw new RemoteDatasetBackendError('Remote validation failed.', 'VALIDATION_FAILED', {
                  status: 400,
                  apiCode
                });
              }
            }
          }

          throw e;
        }
    
  }

  async clearPersistedState(_datasetId: DatasetId): Promise<void> {
    // For remote datasets, clearing local cache is a no-op in Phase 1.
  }
}
