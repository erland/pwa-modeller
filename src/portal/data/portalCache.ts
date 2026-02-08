import type { Model } from '../../domain';
import type { PortalIndexes } from '../indexes/portalIndexes';
import type { LatestPointer, PublishManifest } from './portalDataset';

export type CachedPortalBundle = {
  key: string;
  latestUrl: string;
  bundleId: string;
  cachedAt: number;

  latest: LatestPointer;
  manifestUrl: string;
  manifest: PublishManifest;

  model: Model;
  indexes: PortalIndexes;
};

const DB_NAME = 'ea-modeller-portal-cache';
const DB_VERSION = 1;
const STORE_BUNDLES = 'bundles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BUNDLES)) {
        const store = db.createObjectStore(STORE_BUNDLES, { keyPath: 'key' });
        store.createIndex('latestUrl', 'latestUrl', { unique: false });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_BUNDLES, mode);
        const store = tx.objectStore(STORE_BUNDLES);
        fn(store, tx)
          .then((v) => {
            tx.oncomplete = () => {
              db.close();
              resolve(v);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error ?? new Error('IndexedDB transaction failed'));
            };
          })
          .catch((e) => {
            try {
              tx.abort();
            } catch {
              // ignore
            }
            db.close();
            reject(e);
          });
      })
  );
}

export function makeBundleKey(latestUrl: string, bundleId: string): string {
  return `${latestUrl}::${bundleId}`;
}

export async function getCachedBundle(latestUrl: string, bundleId: string): Promise<CachedPortalBundle | null> {
  const key = makeBundleKey(latestUrl, bundleId);
  return withStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as CachedPortalBundle) ?? null);
      req.onerror = () => reject(req.error ?? new Error('Failed to read from cache'));
    });
  });
}

export async function getMostRecentCachedBundle(latestUrl: string): Promise<CachedPortalBundle | null> {
  return withStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const index = store.index('latestUrl');
      const req = index.openCursor(IDBKeyRange.only(latestUrl));
      let best: CachedPortalBundle | null = null;

      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve(best);
          return;
        }
        const v = cursor.value as CachedPortalBundle;
        if (!best || (typeof v.cachedAt === 'number' && v.cachedAt > best.cachedAt)) {
          best = v;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to iterate cache'));
    });
  });
}

export async function putCachedBundle(
  bundle: Omit<CachedPortalBundle, 'key' | 'cachedAt'> & { cachedAt?: number }
): Promise<void> {
  const record: CachedPortalBundle = {
    key: makeBundleKey(bundle.latestUrl, bundle.bundleId),
    cachedAt: typeof bundle.cachedAt === 'number' ? bundle.cachedAt : Date.now(),
    latestUrl: bundle.latestUrl,
    bundleId: bundle.bundleId,
    latest: bundle.latest,
    manifestUrl: bundle.manifestUrl,
    manifest: bundle.manifest,
    model: bundle.model,
    indexes: bundle.indexes
  };

  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to write to cache'));
    });
  });
}

export async function clearCacheForLatestUrl(latestUrl: string): Promise<void> {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const index = store.index('latestUrl');
      const req = index.openCursor(IDBKeyRange.only(latestUrl));
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve();
          return;
        }
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to clear cache'));
    });
  });
}
