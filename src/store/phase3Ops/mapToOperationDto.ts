import type { Model, Operation } from '../../domain';
import { buildSnapshotReplaceOp } from '../../domain';
import type { OperationDto } from '../remoteDatasetApi';

export function toOperationDto(op: Operation): OperationDto {
  return {
    opId: op.opId,
    type: op.type,
    payload: op.payload
  };
}

/**
 * Phase 3A mapping: represent the current persisted model as a single
 * SNAPSHOT_REPLACE operation.
 */
export function snapshotReplaceDtoFromModel(model: Model): OperationDto {
  return toOperationDto(buildSnapshotReplaceOp(model));
}
