import { makeModel } from '../../../test/builders/modelBuilders';
import { buildJsonPatchOp, buildSnapshotReplaceOp } from '../buildOps';
import { JSON_PATCH, SNAPSHOT_REPLACE } from '../opsTypes';

describe('domain/ops buildOps', () => {
  test('buildSnapshotReplaceOp is deterministic for same model', () => {
    const model = makeModel({ kind: 'archimate' });
    const a = buildSnapshotReplaceOp(model);
    const b = buildSnapshotReplaceOp(model);

    expect(a.type).toBe(SNAPSHOT_REPLACE);
    expect(a.opId).toBe(b.opId);
    expect(a.payload).toBe(model);
  });

  test('buildJsonPatchOp is deterministic for same patch', () => {
    const patch = [
      { op: 'add' as const, path: '/elements/x', value: { id: 'x' } },
      { op: 'replace' as const, path: '/metadata/name', value: 'A' },
      { op: 'remove' as const, path: '/folders/root/elementIds/0' }
    ];
    const a = buildJsonPatchOp(patch);
    const b = buildJsonPatchOp(patch);

    expect(a.type).toBe(JSON_PATCH);
    expect(a.opId).toBe(b.opId);
  });
});
