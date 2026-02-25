import type { DatasetId, DatasetSnapshot } from './datasetTypes';
import type { DatasetRegistry } from './datasetRegistry';

export type DatasetIntegrityIssue = {
  code:
    | 'snapshot_version_invalid'
    | 'snapshot_dataset_id_mismatch'
    | 'snapshot_missing_state'
    | 'registry_invalid'
    | 'registry_active_missing'
    | 'registry_duplicate_dataset_id'
    | 'registry_storage_kind_invalid';
  message: string;
};

/**
 * Validate a dataset snapshot envelope.
 * - Ensures schema version is supported
 * - Ensures snapshot.datasetId matches expected dataset id (when provided)
 * - Ensures required state fields exist (model/fileName/isDirty)
 */
export function validateDatasetSnapshot(
  snapshot: DatasetSnapshot,
  expectedDatasetId?: DatasetId,
): DatasetIntegrityIssue[] {
  const issues: DatasetIntegrityIssue[] = [];

  // Snapshot envelope versioning (local snapshot schema)
  if (snapshot.v !== 1) {
    issues.push({
      code: 'snapshot_version_invalid',
      message: `Unsupported DatasetSnapshot.v=${String(snapshot.v)} (expected 1)`,
    });
  }

  if (expectedDatasetId && snapshot.datasetId !== expectedDatasetId) {
    issues.push({
      code: 'snapshot_dataset_id_mismatch',
      message: `Snapshot datasetId=${snapshot.datasetId} does not match expected ${expectedDatasetId}`,
    });
  }

  // Required persisted slice fields
  if (!('model' in snapshot) || !('fileName' in snapshot) || !('isDirty' in snapshot)) {
    issues.push({
      code: 'snapshot_missing_state',
      message: 'Snapshot missing one or more required fields: model, fileName, isDirty',
    });
  }

  return issues;
}

/**
 * Validate the dataset registry (user-scoped).
 * - activeDatasetId must exist in entries (unless entries is empty)
 * - datasetIds must be unique
 * - storageKind must be 'local' or 'remote' when present
 */
export function validateDatasetRegistry(registry: DatasetRegistry): DatasetIntegrityIssue[] {
  const issues: DatasetIntegrityIssue[] = [];

  if (!registry || registry.v !== 1 || !Array.isArray((registry as any).entries)) {
    issues.push({
      code: 'registry_invalid',
      message: 'Registry is missing or has invalid shape',
    });
    return issues;
  }

  const seen = new Set<string>();
  for (const d of registry.entries) {
    if (seen.has(d.datasetId)) {
      issues.push({
        code: 'registry_duplicate_dataset_id',
        message: `Duplicate datasetId in registry: ${d.datasetId}`,
      });
    }
    seen.add(d.datasetId);

    const kind = (d as any).storageKind;
    if (kind != null && kind !== 'local' && kind !== 'remote') {
      issues.push({
        code: 'registry_storage_kind_invalid',
        message: `Invalid storageKind for datasetId=${d.datasetId}: ${String(kind)}`,
      });
    }
  }

  if (registry.entries.length > 0) {
    const active = registry.activeDatasetId;
    if (!registry.entries.some((d) => d.datasetId === active)) {
      issues.push({
        code: 'registry_active_missing',
        message: `activeDatasetId=${active} is not present in registry entries`,
      });
    }
  }

  return issues;
}
