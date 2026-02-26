import type { DatasetBackend, PersistedStoreSlice } from '../datasetBackend';
import type { DatasetId } from '../datasetTypes';
import { loadDatasetRegistry } from '../datasetRegistry';
import { loadRemoteDatasetSettings } from '../remoteDatasetSettings';
import { getAccessToken } from '../../auth/oidcPkceAuth';

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
    | 'PRECONDITION_REQUIRED'
    | 'HTTP_ERROR'
    | 'INVALID_RESPONSE';

  public readonly status?: number;
  public readonly responseEtag?: string | null;
  /** Optional conflict UX support data (best-effort). */
  public readonly serverSavedAt?: string | null;
  /** Optional conflict UX support data (best-effort). */
  public readonly serverSavedBy?: string | null;

  constructor(
    message: string,
    code: RemoteDatasetBackendError['code'],
    opts?: {
      status?: number;
      responseEtag?: string | null;
      serverSavedAt?: string | null;
      serverSavedBy?: string | null;
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
    // Preserve original error where supported.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).cause = opts?.cause;
  }
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

  private readonly etagsByDatasetId = new Map<string, string>();

  /** Returns the last seen ETag (including quotes) for the dataset, if any. */
  public getLastSeenEtag(datasetId: DatasetId): string | null {
    return this.etagsByDatasetId.get(datasetId) ?? null;
  }

  /** Allows tests / later steps to set the ETag explicitly. */
  public _setLastSeenEtag(datasetId: DatasetId, etag: string): void {
    this.etagsByDatasetId.set(datasetId, etag);
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
    if (etag) this.etagsByDatasetId.set(datasetId, etag);

    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      throw new RemoteDatasetBackendError('Remote snapshot response was not valid JSON.', 'INVALID_RESPONSE', { cause: e });
    }

    // Step 2 assumption: server wraps the modeller model in { payload }.
    const payload = (body as RemoteSnapshotResponse | null)?.payload;

    return {
      model: (payload as PersistedStoreSlice['model']) ?? null,
      fileName: null,
      isDirty: false
    };
  }

  async persistState(datasetId: DatasetId, state: PersistedStoreSlice): Promise<void> {
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

    // Server contract requires a quoted ETag. First write must use "0".
    const last = this.getLastSeenEtag(datasetId) ?? '"0"';
    const ifMatch = ensureQuotedEtag(last);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'If-Match': ifMatch
        },
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
      throw new RemoteDatasetBackendError('Remote snapshot save missing If-Match precondition.', 'PRECONDITION_REQUIRED', {
        status: 428
      });
    }

    const etag = res.headers.get('ETag');

    if (res.status === 409) {
      // Conflict: do not overwrite. Capture server ETag (current revision) for UX.
      if (etag) this.etagsByDatasetId.set(datasetId, etag);

      // Best-effort: parse conflict payload for UX support fields like savedAt/savedBy.
      let savedAt: string | null = null;
      let savedBy: string | null = null;
      try {
        const ct = res.headers.get('Content-Type') ?? '';
        if (ct.includes('application/json')) {
          const body = (await res.json()) as Partial<RemoteSnapshotResponse> | null;
          savedAt = (body?.savedAt as string | undefined) ?? null;
          savedBy = (body?.savedBy as string | undefined) ?? null;
        }
      } catch {
        // Ignore parse failures on conflict.
      }

      throw new RemoteDatasetBackendError('Remote snapshot save conflict (stale revision).', 'CONFLICT', {
        status: 409,
        responseEtag: etag ?? null,
        serverSavedAt: savedAt,
        serverSavedBy: savedBy
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
    if (etag) this.etagsByDatasetId.set(datasetId, etag);

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
