import type { Model } from '../types';
import type { JsonPatchOp, Operation } from './opsTypes';
import { JSON_PATCH, SNAPSHOT_REPLACE } from './opsTypes';
import { buildDeterministicOpId } from './opId';

export function buildSnapshotReplaceOp(model: Model, seed = 'SNAPSHOT_REPLACE'): Operation<Model> {
  const payload = model;
  const opId = buildDeterministicOpId(seed, { type: SNAPSHOT_REPLACE, payload });
  return { opId, type: SNAPSHOT_REPLACE, payload };
}

export function buildJsonPatchOp(patch: JsonPatchOp[], seed = 'JSON_PATCH'): Operation<JsonPatchOp[]> {
  const payload = patch;
  const opId = buildDeterministicOpId(seed, { type: JSON_PATCH, payload });
  return { opId, type: JSON_PATCH, payload };
}

/**
 * Minimal mapping used by Phase 3A:
 * - Given the current local model, represent the write as SNAPSHOT_REPLACE.
 */
export function mapMutationBatchToOperation(modelAfterMutations: Model): Operation<Model> {
  // In Phase 3A we don't try to represent individual mutations.
  // We simply materialize the full snapshot.
  return buildSnapshotReplaceOp(modelAfterMutations);
}
