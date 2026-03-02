import { requestJson, resolveCommon } from './http';
import type {
  SnapshotHistoryResponse,
  SnapshotResponse,
  CurrentSnapshotResponse
} from './types';

type CommonArgs = { baseUrl?: string; token?: string | null };

export async function listSnapshotHistory(
  datasetId: string,
  paging?: { limit?: number; offset?: number },
  args?: CommonArgs
): Promise<{ history: SnapshotHistoryResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const qs = new URLSearchParams();
  if (typeof paging?.limit === 'number') qs.set('limit', String(paging.limit));
  if (typeof paging?.offset === 'number') qs.set('offset', String(paging.offset));

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/snapshots${qs.toString() ? `?${qs.toString()}` : ''}`;

  const { data, etag } = await requestJson<SnapshotHistoryResponse>({
    url,
    method: 'GET',
    token
  });
  return { history: data, etag };
}

/**
 * Restore: POST /datasets/{datasetId}/snapshots/{revision}/restore?force=true
 *
 * Headers:
 * - If-Match: "<etag>" (required)
 * - X-Lease-Token: <token> (required when caller is active lease holder)
 */

export async function restoreSnapshotRevision(
  datasetId: string,
  revision: number,
  body?: { message?: string },
  options?: { ifMatch: string; leaseToken?: string | null; force?: boolean },
  args?: CommonArgs
): Promise<{ snapshot: SnapshotResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);

  const headers: Record<string, string> = {
    'If-Match': options?.ifMatch ?? '"0"'
  };
  if (options?.leaseToken) headers['X-Lease-Token'] = options.leaseToken;

  const url = `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/snapshots/${encodeURIComponent(
    String(revision)
  )}/restore${options?.force ? '?force=true' : ''}`;

  const { data, etag } = await requestJson<SnapshotResponse>({
    url,
    method: 'POST',
    token,
    headers,
    body: body && body.message ? { message: body.message } : undefined
  });

  return { snapshot: data, etag };
}

/**
 * Phase 3: Append operations to the dataset.
 * POST /datasets/{id}/ops
 *
 * Headers:
 * - X-Lease-Token: <token> (required when caller is active lease holder)
 */

export async function getCurrentSnapshot(
  datasetId: string,
  args?: CommonArgs
): Promise<{ snapshot: CurrentSnapshotResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<CurrentSnapshotResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/snapshot`,
    method: 'GET',
    token
  });
  return { snapshot: data, etag };
}
