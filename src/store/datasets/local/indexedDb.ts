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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    const indexedDb: IDBFactory | undefined = g?.indexedDB;
    if (!indexedDb) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const req = indexedDb.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
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
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        req.onsuccess = () => resolve(req.result);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
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
