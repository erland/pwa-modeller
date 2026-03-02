import { requestJson, requestNoContent, resolveCommon } from './http';
import type { DatasetLeaseResponse } from './types';

type CommonArgs = { baseUrl?: string; token?: string | null };

export async function acquireOrRefreshLease(
  datasetId: string,
  args?: CommonArgs
): Promise<{ lease: DatasetLeaseResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<DatasetLeaseResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/lease`,
    method: 'POST',
    token
  });
  return { lease: data, etag };
}

/**
 * Leases: GET /datasets/{datasetId}/lease (status)
 */

export async function getLeaseStatus(
  datasetId: string,
  args?: CommonArgs
): Promise<{ lease: DatasetLeaseResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<DatasetLeaseResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/lease`,
    method: 'GET',
    token
  });
  return { lease: data, etag };
}

/**
 * Leases: DELETE /datasets/{datasetId}/lease (release)
 * Server always returns 204.
 */

export async function releaseLease(datasetId: string, args?: CommonArgs): Promise<void> {
  const { baseUrl, token } = await resolveCommon(args);
  await requestNoContent({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/lease`,
    method: 'DELETE',
    token
  });
}

/**
 * History: GET /datasets/{datasetId}/snapshots?limit=..&offset=..
 */
