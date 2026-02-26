import { loadRemoteDatasetSettings } from './remoteDatasetSettings';

export type RemoteDatasetListItem = {
  datasetId: string;
  name: string;
  description?: string | null;
  updatedAt?: string | number | null;
  createdAt?: string | number | null;
};

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function assertOk(res: Response, bodyText?: string): void {
  if (res.ok) return;
  const msg = bodyText ? `${res.status} ${res.statusText}: ${bodyText}` : `${res.status} ${res.statusText}`;
  throw new Error(msg);
}

function toListItem(v: unknown): RemoteDatasetListItem | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const datasetId = (r['datasetId'] ?? r['id']) as unknown;
  const name = (r['name'] ?? r['title']) as unknown;
  if (typeof datasetId !== 'string' || typeof name !== 'string') return null;
  const description =
    typeof r['description'] === 'string' ? (r['description'] as string) : r['description'] == null ? null : undefined;
  return {
    datasetId,
    name,
    description,
    updatedAt: (r['updatedAt'] as any) ?? null,
    createdAt: (r['createdAt'] as any) ?? null
  };
}

async function readJson(res: Response): Promise<unknown> {
  const txt = await res.text();
  if (!res.ok) {
    assertOk(res, txt);
  }
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Lists datasets visible to the current user.
 * Phase 1 contract: GET {baseUrl}/datasets, token auth.
 */
export async function listRemoteDatasets(args?: { baseUrl?: string; token?: string | null }): Promise<RemoteDatasetListItem[]> {
  const settings = loadRemoteDatasetSettings();
  const baseUrl = normalizeBaseUrl(args?.baseUrl ?? settings.remoteServerBaseUrl ?? '');
  if (!baseUrl) throw new Error('Remote server baseUrl is not set');
  const token = typeof args?.token === 'undefined' ? settings.remoteAccessToken ?? null : args.token;
  if (!token) throw new Error('Remote access token is not set');

  const res = await fetch(`${baseUrl}/datasets`, {
    method: 'GET',
    headers: {
      ...authHeaders(token),
      Accept: 'application/json'
    }
  });

  const json = await readJson(res);

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
 * Phase 1 contract: POST {baseUrl}/datasets with {name, description?}.
 */
export async function createRemoteDataset(input: {
  baseUrl?: string;
  token?: string | null;
  name: string;
  description?: string;
}): Promise<RemoteDatasetListItem> {
  const settings = loadRemoteDatasetSettings();
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? settings.remoteServerBaseUrl ?? '');
  if (!baseUrl) throw new Error('Remote server baseUrl is not set');
  const token = typeof input.token === 'undefined' ? settings.remoteAccessToken ?? null : input.token;
  if (!token) throw new Error('Remote access token is not set');

  const res = await fetch(`${baseUrl}/datasets`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: input.name, description: input.description ?? null })
  });

  const json = await readJson(res);
  const item = toListItem(json);
  if (!item) throw new Error('Unexpected create dataset response');
  return item;
}
