import type { Model } from '../../../domain';
import { createEmptyModel } from '../../../domain';
import type { OperationDto } from '../../remoteDatasetApi';
import { applyOperationDtoToModel, applyOperationDtosToModel } from '../applyOperation';

function baseModel(): Model {
  // Provide fixed ids to keep deterministic tests.
  return createEmptyModel({ name: 'Base' }, 'model-1');
}

describe('phase3Ops applyOperation', () => {
  test('SNAPSHOT_REPLACE replaces entire model', () => {
    const m = baseModel();
    const op: OperationDto = {
      opId: 'op-1',
      type: 'SNAPSHOT_REPLACE',
      payload: createEmptyModel({ name: 'Replaced' }, 'model-2'),
    };

    const next = applyOperationDtoToModel(m, op);
    expect(next.id).toBe('model-2');
    expect(next.metadata.name).toBe('Replaced');
  });

  test('JSON_PATCH replace updates metadata.name', () => {
    const m = baseModel();
    const op: OperationDto = {
      opId: 'op-2',
      type: 'JSON_PATCH',
      payload: [{ op: 'replace', path: '/metadata/name', value: 'Patched' }],
    };

    const next = applyOperationDtoToModel(m, op);
    expect(next.id).toBe('model-1');
    expect(next.metadata.name).toBe('Patched');
  });

  test('JSON_PATCH add/remove work for optional fields', () => {
    const m = baseModel();
    const ops: OperationDto[] = [
      {
        opId: 'op-3',
        type: 'JSON_PATCH',
        payload: [{ op: 'add', path: '/metadata/description', value: 'Hello' }],
      },
      {
        opId: 'op-4',
        type: 'JSON_PATCH',
        payload: [{ op: 'remove', path: '/metadata/description' }],
      },
    ];

    const next = applyOperationDtosToModel(m, ops);
    expect(next.metadata.description).toBeUndefined();
  });

  test('unknown op type is ignored', () => {
    const m = baseModel();
    const op: OperationDto = { opId: 'op-x', type: 'SOMETHING_NEW', payload: { a: 1 } };
    const next = applyOperationDtoToModel(m, op);
    expect(next).toBe(m);
  });
});
