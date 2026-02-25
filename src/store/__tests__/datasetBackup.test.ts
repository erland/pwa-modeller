import { createDatasetBackupJson, parseDatasetBackupJson } from '../datasetBackup';

test('dataset backup round-trips and preserves snapshot fields', () => {
  const json = createDatasetBackupJson({
    datasetId: 'local:default' as any,
    name: 'My dataset',
    snapshot: { model: null, fileName: 'x.json', isDirty: true }
  });

  const parsed = parseDatasetBackupJson(json);
  expect(parsed.version).toBe(1);
  expect(parsed.name).toBe('My dataset');
  expect(parsed.snapshot.fileName).toBe('x.json');
  expect(parsed.snapshot.isDirty).toBe(true);
});
