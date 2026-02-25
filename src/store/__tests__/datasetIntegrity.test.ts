import type { DatasetId, DatasetSnapshot } from '../datasetTypes';
import { DEFAULT_LOCAL_DATASET_ID } from '../datasetTypes';
import type { DatasetRegistry } from '../datasetRegistry';
import { validateDatasetRegistry, validateDatasetSnapshot } from '../datasetIntegrity';

describe('datasetIntegrity', () => {
  test('validateDatasetSnapshot detects datasetId mismatch and invalid version', () => {
    const snapshot = {
      v: 999,
      datasetId: 'local:other' as DatasetId,
      model: null,
      fileName: null,
      isDirty: false,
    } satisfies DatasetSnapshot;

    const issues = validateDatasetSnapshot(snapshot, DEFAULT_LOCAL_DATASET_ID);
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['snapshot_version_invalid', 'snapshot_dataset_id_mismatch']),
    );
  });

  test('validateDatasetRegistry detects missing active and duplicates', () => {
    const registry: DatasetRegistry = {
      v: 1,
      activeDatasetId: DEFAULT_LOCAL_DATASET_ID,
      entries: [
        {
          datasetId: 'local:a' as DatasetId,
          storageKind: 'local',
          name: 'A',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          datasetId: 'local:a' as DatasetId,
          storageKind: 'local',
          name: 'A2',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    };

    const issues = validateDatasetRegistry(registry);
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['registry_active_missing', 'registry_duplicate_dataset_id']),
    );
  });

  test('validateDatasetRegistry accepts legacy entries without storageKind', () => {
    const registry: any = {
      v: 1,
      activeDatasetId: DEFAULT_LOCAL_DATASET_ID,
      entries: [
        {
          datasetId: DEFAULT_LOCAL_DATASET_ID,
          name: 'Local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const issues = validateDatasetRegistry(registry as DatasetRegistry);
    expect(issues).toHaveLength(0);
  });
});
