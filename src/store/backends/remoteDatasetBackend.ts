import type { DatasetBackend, PersistedStoreSlice } from '../datasetBackend';
import type { DatasetId } from '../datasetTypes';
import { loadDatasetRegistry } from '../datasetRegistry';
import { isPhase3OpsEnabled, loadRemoteDatasetSettings } from '../remoteDatasetSettings';
import {
  getLastSeenEtag as getSessionEtag,
  getLeaseToken as getSessionLeaseToken,
  getPendingOps,
  setLastSeenEtag as setSessionEtag,
  setPendingOps,
  setLastAppliedRevision,
  setServerRevision
} from '../remoteDatasetSession';
import { remoteOpsSync } from '../phase3Sync';
import { snapshotReplaceDtoFromModel } from '../phase3Ops/mapToOperationDto';
import { getAccessToken } from '../../auth/oidcPkceAuth';
import type { ApiError, LeaseConflictResponse, SnapshotConflictResponse, ValidationError } from '../remoteDatasetApi';

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

async function readJsonIfPossible(res: Response): Promise<unknown | null> {
  try {
    const ct = res.headers.get('Content-Type') ?? '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function isLeaseConflict(body: unknown): body is LeaseConflictResponse {
  if (!body || typeof body !== 'object') return false;
  const b = body as any;
  return typeof b.datasetId === 'string' && typeof b.holderSub === 'string' && typeof b.expiresAt === 'string';
}

function isSnapshotConflict(body: unknown): body is SnapshotConflictResponse {
  if (!body || typeof body !== 'object') return false;
  const b = body as any;
  return typeof b.datasetId === 'string' && (typeof b.currentRevision === 'number' || typeof b.currentEtag === 'string');
}

function isApiError(body: unknown): body is ApiError {
  if (!body || typeof body !== 'object') return false;
  const b = body as any;
  return typeof b.status === 'number' && typeof b.code === 'string' && typeof b.message === 'string';
}

function normalizeBaseUrl(baseUrl: string): string {
  const t = baseUrl.trim();
  if (!t) return '';
  return t.endsWith('/') ? t.slice(0, -1) : t;
}

function ensureQuotedEtag(etag: string): string {
  const t = etag.trim();
  if (!t) return '"0"';
  // Server contract says ETag is quoted. Be defensive in case a server omits quotes.
  if (t.startsWith('"') && t.endsWith('"')) return t;
  return `"${t.replaceAll('"', '')}"`;
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
    // Phase 3 (Step 6): ops-based persistence
    // -----------------------------
    if (isPhase3OpsEnabled()) {
      // Ensure we have at least one pending op representing the latest local state.
      // (Edits routed through ModelStore.updateModel should already do this.)
      const pending = getPendingOps(datasetId);
      if (pending.length === 0 && state.model) {
        setPendingOps(datasetId, [snapshotReplaceDtoFromModel(state.model)]);
      }

      const leaseToken = (getSessionLeaseToken(datasetId) ?? '').trim();
      try {
        await remoteOpsSync.flushPending(datasetId, remoteRef.serverDatasetId, {
          leaseToken: leaseToken || null,
          force: opts.force
        });
        return;
      } catch (e) {
        // Step 7 adds conflict/retry semantics. For now, surface the error.
        throw e;
      }
    }

    const url = `${baseUrl}/datasets/${encodeURIComponent(remoteRef.serverDatasetId)}/snapshot${opts.force ? '?force=true' : ''}`;

    // Server contract requires a quoted ETag. First write must use "0".
    const last = this.getLastSeenEtag(datasetId) ?? '"0"';
    const ifMatch = ensureQuotedEtag(last);

    // Step 4: include lease token header when we currently hold a lease.
    // Server requires token only when lease is active *and* held by caller.
    const leaseToken = (getSessionLeaseToken(datasetId) ?? '').trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers: any = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'If-Match': ifMatch
    };
    if (leaseToken) headers['X-Lease-Token'] = leaseToken;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers,
        // Phase 1 contract: body is the modeller snapshot payload.
        body: JSON.stringify(state.model ?? null)
      });
    } catch (e) {
      throw new RemoteDatasetBackendError('Remote snapshot save request failed.', 'HTTP_ERROR', { cause: e });
    }

    if (res.status === 401 || res.status === 403) {
      throw new RemoteDatasetBackendError('Remote authorization failed.', 'AUTH_FAILED', { status: res.status });
    }
    if (res.status === 404) {
      throw new RemoteDatasetBackendError('Remote dataset not found or no access.', 'NOT_FOUND', { status: 404 });
    }
    if (res.status === 428) {
      const body = await readJsonIfPossible(res);
      if (isApiError(body) && body.code === 'LEASE_TOKEN_REQUIRED') {
        throw new RemoteDatasetBackendError(body.message || 'Lease token required.', 'LEASE_TOKEN_REQUIRED', {
          status: 428,
          apiCode: body.code,
          validationErrors: (body as any).validationErrors ?? null
        });
      }
      throw new RemoteDatasetBackendError('Remote snapshot save missing If-Match precondition.', 'PRECONDITION_REQUIRED', {
        status: 428,
        apiCode: isApiError(body) ? body.code : null
      });
    }

    const etag = res.headers.get('ETag');

    if (res.status === 409) {
      // Conflict: could be stale If-Match OR lease held by someone else.
      // Capture server ETag (current revision) for UX.
      if (etag) setSessionEtag(datasetId, etag);

      const body = await readJsonIfPossible(res);

      if (isLeaseConflict(body)) {
        throw new RemoteDatasetBackendError('Remote dataset is locked by another user.', 'LEASE_CONFLICT', {
          status: 409,
          responseEtag: etag ?? null,
          leaseHolderSub: body.holderSub ?? null,
          leaseExpiresAt: body.expiresAt ?? null
        });
      }

      if (isSnapshotConflict(body)) {
        const bodyAny: any = body as any;
        const currentEtag = (bodyAny.currentEtag ?? null) as (string | null);
        const rev = (typeof bodyAny.currentRevision === 'number' ? bodyAny.currentRevision : null) as (number | null);
        const bestEtag = (etag ?? currentEtag) as (string | null);
        if (bestEtag) setSessionEtag(datasetId, bestEtag);
        throw new RemoteDatasetBackendError('Remote snapshot save conflict (stale revision).', 'CONFLICT', {
          status: 409,
          responseEtag: bestEtag ?? null,
          serverRevision: rev,
          serverSavedAt: bodyAny.savedAt ?? null,
          serverSavedBy: bodyAny.savedBy ?? null,
          serverUpdatedAt: bodyAny.updatedAt ?? null,
          serverUpdatedBy: bodyAny.updatedBy ?? null
        });
      }

      // Fallback: unknown 409 body.
      throw new RemoteDatasetBackendError('Remote snapshot save conflict (409).', 'CONFLICT', {
        status: 409,
        responseEtag: etag ?? null
      });
    }

    if (res.status === 400) {
      const body = await readJsonIfPossible(res);
      if (isApiError(body) && body.code === 'VALIDATION_FAILED') {
        throw new RemoteDatasetBackendError(body.message || 'Remote validation failed.', 'VALIDATION_FAILED', {
          status: 400,
          apiCode: body.code,
          validationErrors: (body as any).validationErrors ?? null
        });
      }
      throw new RemoteDatasetBackendError(`Remote snapshot save request failed (${res.status}).`, 'HTTP_ERROR', {
        status: 400,
        apiCode: isApiError(body) ? body.code : null
      });
    }

    if (!res.ok) {
      throw new RemoteDatasetBackendError(
        `Remote snapshot save request failed (${res.status}).`,
        'HTTP_ERROR',
        { status: res.status }
      );
    }

    // Success: update revision token from response.
    if (etag) setSessionEtag(datasetId, etag);

    // Response body is not required for Phase 1. Read+discard to surface JSON errors in dev.
    // Some servers may return 200 with no JSON; that's fine.
    try {
      const ct = res.headers.get('Content-Type') ?? '';
      if (ct.includes('application/json')) {
        await res.json();
      }
    } catch {
      // Ignore parse failures on success to keep persistence robust.
    }
  }

  async clearPersistedState(_datasetId: DatasetId): Promise<void> {
    // For remote datasets, clearing local cache is a no-op in Phase 1.
  }
}
