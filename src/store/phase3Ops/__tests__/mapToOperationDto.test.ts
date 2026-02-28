import { makeModel } from '../../../test/builders/modelBuilders';
import { snapshotReplaceDtoFromModel } from '../mapToOperationDto';

describe('store/phase3Ops mapToOperationDto', () => {
  test('snapshotReplaceDtoFromModel builds a SNAPSHOT_REPLACE OperationDto', () => {
    const model = makeModel({ kind: 'archimate' });
    const dto = snapshotReplaceDtoFromModel(model);

    expect(dto.type).toBe('SNAPSHOT_REPLACE');
    expect(typeof dto.opId).toBe('string');
    expect(dto.opId.length).toBeGreaterThan(0);
    expect(dto.payload).toBe(model);
  });
});
