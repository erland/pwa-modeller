export type DatasetInfo = {
  datasetId: string;
  title?: string;
  updatedAt?: string;
  latestBundleId?: string;
};

export type PublishResponse = {
  datasetId: string;
  bundleId: string;
  publishedAt?: string;
  urls?: {
    latest?: string | null;
    manifest?: string | null;
  };
};

export type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  timestamp?: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function joinApi(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function makeRequestId(): string {
  // simple request id suitable for tracing
  return `pwa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readErrorMessage(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/problem+json')) {
      const pd = (await res.json()) as ProblemDetails;
      const detail = pd.detail?.trim();
      const title = pd.title?.trim();
      const rid = pd.requestId ? ` (requestId: ${pd.requestId})` : '';
      return (detail || title || `Request failed with status ${res.status}`) + rid;
    }
  } catch {
    // ignore parse errors
  }

  try {
    const text = (await res.text()).trim();
    if (text) return text;
  } catch {
    // ignore
  }

  return `Request failed with status ${res.status}`;
}

export async function listDatasets(baseUrl: string): Promise<DatasetInfo[]> {
  const url = joinApi(baseUrl, '/api/datasets');
  const requestId = makeRequestId();

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, application/problem+json',
      'X-Request-Id': requestId
    }
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  const data = (await res.json()) as { datasets?: DatasetInfo[] };
  return Array.isArray(data.datasets) ? data.datasets : [];
}

export async function publishZip(args: {
  baseUrl: string;
  datasetId: string;
  zipBytes: Uint8Array;
  zipFileName: string;
  title?: string;
}): Promise<PublishResponse> {
  const baseUrl = args.baseUrl;
  const datasetId = args.datasetId;
  const url = joinApi(baseUrl, `/api/datasets/${encodeURIComponent(datasetId)}/publish`);
  const requestId = makeRequestId();

  const form = new FormData();
  const bytes = args.zipBytes instanceof Uint8Array ? args.zipBytes : new Uint8Array(args.zipBytes as any);
  // Convert to an ArrayBuffer slice to satisfy BlobPart typing across TS lib variants.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([ab], { type: 'application/zip' });
  // Provide a filename so server sees a proper part
  form.append('bundleZip', blob, args.zipFileName);

  if (args.title?.trim()) {
    form.append('title', args.title.trim());
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, application/problem+json',
      'X-Request-Id': requestId
      // NOTE: do not set Content-Type for FormData; browser sets boundary
    },
    body: form
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  return (await res.json()) as PublishResponse;
}
