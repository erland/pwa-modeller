import type { Model } from '../domain';
import type { DatasetId } from './datasetTypes';
import type { ChangeSet } from './changeSet';

export type PersistedSlice = {
  model: Model | null;
  fileName: string | null;
  isDirty: boolean;
};

export type StoreFlushEvent = {
  datasetId: DatasetId;
  persisted: PersistedSlice;
  changeSet: ChangeSet;
  timestamp: number;
};
