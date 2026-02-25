import type { DatasetId, DatasetSnapshot } from './datasetTypes';
import { sanitizeFileNameWithExtension } from './download';

export type DatasetBackupV1 = {
  version: 1;
  exportedAt: string;
  sourceDatasetId: string;
  name?: string;
  snapshot: DatasetSnapshot;
};

export function createDatasetBackupJson(args: {
  datasetId: DatasetId;
  name?: string | null;
  snapshot: DatasetSnapshot;
}): string {
  const backup: DatasetBackupV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceDatasetId: args.datasetId as unknown as string,
    name: args.name ?? undefined,
    snapshot: args.snapshot
  };
  return JSON.stringify(backup, null, 2);
}

export function parseDatasetBackupJson(json: string): DatasetBackupV1 {
  const parsed = JSON.parse(json) as Partial<DatasetBackupV1>;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(parsed.version)}`);
  }
  if (!parsed.snapshot || typeof parsed.snapshot !== 'object') {
    throw new Error('Invalid backup: missing snapshot');
  }
  return parsed as DatasetBackupV1;
}

export function defaultBackupFileName(name: string | null | undefined): string {
  const base = (name && name.trim()) ? name.trim() : 'dataset-backup';
  return sanitizeFileNameWithExtension(`${base}.backup.json`, 'json');
}
