import type { DatasetBackend, PersistedStoreSlice } from '../datasetBackend';
import type { DatasetId } from '../datasetTypes';
import { loadDatasetRegistry } from '../datasetRegistry';
import { loadRemoteDatasetSettings } from '../remoteDatasetSettings';

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
    | 'HTTP_ERROR'
    | 'INVALID_RESPONSE';

  public readonly status?: number;

  constructor(
    message: string,
    code: RemoteDatasetBackendError['code'],
    opts?: { status?: number; cause?: unknown }
  ) {
    super(message);
    this.name = 'RemoteDatasetBackendError';
    this.code = code;
    this.status = opts?.status;
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

    const { remoteAccessToken } = loadRemoteDatasetSettings();
    const token = remoteAccessToken.trim();
    if (!token) {
      throw new RemoteDatasetBackendError('Remote access token is missing.', 'AUTH_MISSING');
    }

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

  async persistState(_datasetId: DatasetId, _state: PersistedStoreSlice): Promise<void> {
    // Implemented in Step 3.
    throw new Error('RemoteDatasetBackend.persistState not implemented (Step 3).');
  }

  async clearPersistedState(_datasetId: DatasetId): Promise<void> {
    // For remote datasets, clearing local cache is a no-op in Phase 1.
  }
}
