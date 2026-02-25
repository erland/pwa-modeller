import type { DatasetId } from '../../datasetTypes';
import type { PersistedStoreSlice } from '../../datasetBackend';

const DB_NAME = 'pwa-modeller';
const DB_VERSION = 1;
const STORE_NAME = 'datasets';

type DatasetRecord = {
  datasetId: string;
  slice: PersistedStoreSlice;
  updatedAt: string;
};

export type IndexedDbErrorCode =
  | 'unavailable'
  | 'open_failed'
  | 'transaction_failed'
  | 'request_failed'
  | 'quota_exceeded';

export class IndexedDbError extends Error {
  readonly code: IndexedDbErrorCode;
  readonly cause?: unknown;

  constructor(code: IndexedDbErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'IndexedDbError';
    this.code = code;
    this.cause = cause;
  }
}

function isQuotaExceeded(err: unknown): boolean {
  // DOMException name varies by browser, but QuotaExceededError is common.
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return name === 'QuotaExceededError' || msg.includes('quota');
}

function wrapIdbError(code: IndexedDbErrorCode, message: string, cause?: unknown): IndexedDbError {
  if (code !== 'quota_exceeded' && isQuotaExceeded(cause)) {
    return new IndexedDbError('quota_exceeded', 'IndexedDB quota exceeded', cause);
  }
  return new IndexedDbError(code, message, cause);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    const indexedDb: IDBFactory | undefined = g?.indexedDB;
    if (!indexedDb) {
      reject(wrapIdbError('unavailable', 'IndexedDB is not available in this environment'));
      return;
    }

    const req = indexedDb.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(wrapIdbError('open_failed', 'Failed to open IndexedDB', req.error));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'datasetId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        req.onerror = () => reject(wrapIdbError('request_failed', 'IndexedDB request failed', req.error));
        req.onsuccess = () => resolve(req.result);
        tx.onabort = () => reject(wrapIdbError('transaction_failed', 'IndexedDB transaction aborted', tx.error));
      })
  );
}

export async function getDatasetSlice(datasetId: DatasetId): Promise<PersistedStoreSlice | null> {
  const record = await withStore<DatasetRecord | undefined>('readonly', (s) => s.get(datasetId as unknown as string));
  return record?.slice ?? null;
}

export async function putDatasetSlice(datasetId: DatasetId, slice: PersistedStoreSlice): Promise<void> {
  const record: DatasetRecord = {
    datasetId: datasetId as unknown as string,
    slice,
    updatedAt: new Date().toISOString()
  };
  await withStore('readwrite', (s) => s.put(record));
}

export async function deleteDatasetSlice(datasetId: DatasetId): Promise<void> {
  await withStore('readwrite', (s) => s.delete(datasetId as unknown as string));
}
