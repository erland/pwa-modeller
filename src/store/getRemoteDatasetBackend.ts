import type { DatasetBackend } from './datasetBackend';
import { RemoteDatasetBackend } from './backends/remoteDatasetBackend';

let __remoteBackend: DatasetBackend | null = null;

/**
 * Returns a singleton RemoteDatasetBackend instance.
 *
 * Reason: the backend caches the last seen ETag per open dataset. Using a singleton keeps
 * optimistic concurrency tokens consistent across "open" and subsequent auto-persistence.
 */
export function getRemoteDatasetBackend(): DatasetBackend {
  if (!__remoteBackend) {
    __remoteBackend = new RemoteDatasetBackend();
  }
  return __remoteBackend;
}
