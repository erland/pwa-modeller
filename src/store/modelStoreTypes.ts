import type { Model } from '../domain';
import type { DatasetId } from './datasetTypes';

export type PersistenceStatus =
  | { status: 'ok'; message: null; lastOkAt: number; lastErrorAt: number | null }
  | { status: 'error'; message: string; lastOkAt: number | null; lastErrorAt: number };

export type ModelStoreState = {
  /** Identifies which dataset the current in-memory model belongs to. */
  activeDatasetId: DatasetId;
  model: Model | null;
  /** The last chosen file name (used as default for downloads). */
  fileName: string | null;
  /** Tracks if there are unsaved changes since last load/save. */
  isDirty: boolean;

  /**
   * User-scoped runtime status about persistence health.
   * Dataset snapshots remain dataset-scoped; this status is per device/session.
   */
  persistenceStatus: PersistenceStatus;
};

export type StoreListener = () => void;
