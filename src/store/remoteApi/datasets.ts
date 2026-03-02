import { requestJson, resolveCommon } from './http';
import type { RemoteDatasetListItem, ValidationPolicy, DatasetHeadResponse, Role } from './types';

function toListItem(v: unknown): RemoteDatasetListItem | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const datasetId = (r['datasetId'] ?? r['id']) as unknown;
  const name = (r['name'] ?? r['title']) as unknown;
  if (typeof datasetId !== 'string' || typeof name !== 'string') return null;

  const description =
    typeof r['description'] === 'string' ? (r['description'] as string) : r['description'] == null ? null : undefined;

  const validationPolicy =
    r['validationPolicy'] === 'none' || r['validationPolicy'] === 'basic' || r['validationPolicy'] === 'strict'
      ? (r['validationPolicy'] as ValidationPolicy)
      : r['validationPolicy'] == null
        ? null
        : undefined;

  const role =
    r['role'] === 'OWNER' || r['role'] === 'EDITOR' || r['role'] === 'VIEWER'
      ? (r['role'] as Role)
      : r['role'] == null
        ? null
        : undefined;

  return {
    datasetId,
    name,
    description,
    updatedAt: (r['updatedAt'] as any) ?? null,
    createdAt: (r['createdAt'] as any) ?? null,
    currentRevision: typeof r['currentRevision'] === 'number' ? (r['currentRevision'] as number) : null,
    validationPolicy,
    status: (r['status'] as any) ?? null,
    role
  };
}

export async function listRemoteDatasets(args?: { baseUrl?: string; token?: string | null }): Promise<RemoteDatasetListItem[]> {
  const { baseUrl, token } = await resolveCommon(args);

  const { data: json } = await requestJson<unknown>({
    url: `${baseUrl}/datasets`,
    method: 'GET',
    token
  });

  const rawItems = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as any).items)
      ? (json as any).items
      : [];

  const items: RemoteDatasetListItem[] = [];
  for (const it of rawItems) {
    const mapped = toListItem(it);
    if (mapped) items.push(mapped);
  }
  return items;
}

/**
 * Creates a new dataset.
 * Phase 2 contract: POST {baseUrl}/datasets with {name, description?, validationPolicy?}.
 */

export async function createRemoteDataset(input: {
  baseUrl?: string;
  token?: string | null;
  name: string;
  description?: string;
  validationPolicy?: ValidationPolicy;
}): Promise<RemoteDatasetListItem> {
  const { baseUrl, token } = await resolveCommon({ baseUrl: input.baseUrl, token: input.token });

  const body: any = { name: input.name, description: input.description ?? null };
  if (input.validationPolicy) body.validationPolicy = input.validationPolicy;

  const { data: json } = await requestJson<unknown>({
    url: `${baseUrl}/datasets`,
    method: 'POST',
    token,
    body
  });

  const item = toListItem(json);
  if (!item) throw new Error('Unexpected create dataset response');
  return item;
}

type CommonArgs = { baseUrl?: string; token?: string | null };

/**
 * Head polling: GET /datasets/{datasetId}/head
 */

export async function getDatasetHead(
  datasetId: string,
  args?: CommonArgs
): Promise<{ head: DatasetHeadResponse; etag: string | null }> {
  const { baseUrl, token } = await resolveCommon(args);
  const { data, etag } = await requestJson<DatasetHeadResponse>({
    url: `${baseUrl}/datasets/${encodeURIComponent(datasetId)}/head`,
    method: 'GET',
    token
  });
  return { head: data, etag };
}

/**
 * Leases: POST /datasets/{datasetId}/lease (acquire or refresh)
 */
