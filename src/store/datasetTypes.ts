/**
 * Dataset primitives used to prepare the PWA for multiple datasets (local and later remote).
 *
 * These types are intentionally technology-agnostic: they express *what* we store/load,
 * not *how* it is stored.
 */

import type { Model } from '../domain';

// Brand helper to avoid mixing plain strings with DatasetId.
export type Branded<T, B extends string> = T & { readonly __brand: B };

/** A stable identifier for a dataset (local or remote). */
export type DatasetId = Branded<string, 'DatasetId'>;
export type DatasetStorageKind = 'local' | 'remote';


/**
 * Identifies a dataset and (future) branch/revision context.
 *
 * In local-only mode, branch and headRevisionId are optional and typically omitted.
 */
export type DatasetRef = {
  datasetId: DatasetId;
  branch?: string;
  headRevisionId?: string;
};

/**
 * Canonical snapshot representation used for persistence.
 *
 * In local-only mode this corresponds to the store slice we persist.
 */
export type DatasetSnapshot = {
  v: number; // envelope/schema version (not the model's schemaVersion)
  datasetId: DatasetId;
  model: Model | null;
  fileName: string | null;
  isDirty: boolean;
};

/** Default dataset used for the existing single-model local mode. */
export const DEFAULT_LOCAL_DATASET_ID = 'local:default' as DatasetId;
