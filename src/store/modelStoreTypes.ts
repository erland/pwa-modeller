import type { Model } from '../domain';
import type { DatasetId } from './datasetTypes';

export type PersistenceStatus =
  | { status: 'ok'; message: null; lastOkAt: number; lastErrorAt: number | null }
  | { status: 'error'; message: string; lastOkAt: number | null; lastErrorAt: number };


export type RemotePersistenceConflict = {
  datasetId: DatasetId;
  /** Human-readable message for the user. */
  message: string;
  /** When the conflict was detected (ms since epoch). */
  detectedAt: number;
  /** Latest server ETag if known (quoted). */
  serverEtag: string | null;
  /** Best-effort conflict help: who last updated the server snapshot. */
  serverSavedBy?: string | null;
  /** Best-effort conflict help: when the server snapshot was last saved (ISO string). */
  serverSavedAt?: string | null;
};


export type RemotePersistenceValidationFailure = {
  datasetId: DatasetId;
  /** Human-readable message for the user. */
  message: string;
  /** When the validation failure was detected (ms since epoch). */
  detectedAt: number;
  /** Server-provided validation errors, if available. */
  validationErrors: Array<{
    path: string;
    message: string;
    rule?: string | null;
    severity?: 'ERROR' | 'WARN' | string | null;
  }>;
};

export type RemoteLeaseConflict = {
  datasetId: DatasetId;
  /** Human-readable message for the user. */
  message: string;
  /** When the conflict was detected (ms since epoch). */
  detectedAt: number;
  holderSub: string | null;
  expiresAt: string | null;
  myRole: 'OWNER' | 'EDITOR' | 'VIEWER' | null;
  /** Latest server ETag if known (quoted). */
  serverEtag: string | null;
};

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

  /** Set when remote optimistic concurrency detects a conflict (Phase 1). */
  persistenceConflict: RemotePersistenceConflict | null;

  /** Set when the server rejects the snapshot due to validation errors (Phase 2). */
  persistenceValidationFailure: RemotePersistenceValidationFailure | null;

  /** Set when the remote dataset is lease-locked by another user (Phase 2). */
  persistenceLeaseConflict: RemoteLeaseConflict | null;
};

export type StoreListener = () => void;
