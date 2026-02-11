import { listDatasets, publishZip } from '../publishServerClient';

type MockHeaders = { get: (name: string) => string | null };

function headersFrom(obj: Record<string, string>): MockHeaders {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function mockJsonResponse(status: number, body: any, headers: Record<string, string>) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersFrom(headers),
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  } as any;
}

function mockFetchOnce(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<any>) {
  // @ts-expect-error override for test
  global.fetch = impl;
}

describe('publishServerClient', () => {
  it('listDatasets returns datasets array', async () => {
    mockFetchOnce(async () => {
      return mockJsonResponse(
        200,
        { datasets: [{ datasetId: 'a', title: 'A' }] },
        { 'Content-Type': 'application/json' }
      );
    });

    const res = await listDatasets('https://example.test');
    expect(res).toHaveLength(1);
    expect(res[0].datasetId).toBe('a');
  });

  it('publishZip surfaces problem+json detail', async () => {
    mockFetchOnce(async () => {
      return mockJsonResponse(
        400,
        { title: 'Publishing error', status: 400, detail: 'Bad dataset', requestId: 'r1' },
        { 'Content-Type': 'application/problem+json' }
      );
    });

    await expect(
      publishZip({
        baseUrl: 'https://example.test',
        datasetId: 'bad',
        zipBytes: new Uint8Array([1, 2, 3]),
        zipFileName: 'x.zip',
      })
    ).rejects.toThrow(/Bad dataset/);
  });
});
