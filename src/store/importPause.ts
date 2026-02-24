import { flushStorePersistence, setStorePersistencePaused } from './initStorePersistence';
import { setOverlayPersistencePaused } from './overlay/initOverlayPersistence';

/**
 * Import-only optimization: Pause store + overlay persistence during bulk imports
 * to avoid O(mutations × modelSize) signature/hash work on every change.
 */
export function runWithImportPersistencePaused<T>(fn: () => T): T {
  setStorePersistencePaused(true);
  setOverlayPersistencePaused(true);
  try {
    return fn();
  } finally {
    setStorePersistencePaused(false);
    setOverlayPersistencePaused(false);
    // Persist once after import completes.
    flushStorePersistence();
  }
}
