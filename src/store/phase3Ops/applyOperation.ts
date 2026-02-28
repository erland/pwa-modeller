import type { Model } from '../../domain';
import type { OperationDto, OperationType } from '../remoteDatasetApi';
import { deserializeModel } from '../persistence/deserialize';
import type { JsonPatchOp } from '../../domain/ops';

/**
 * Apply a Phase 3 OperationDto to the local model deterministically.
 *
 * Deterministic here means:
 * - No generation of new ids or timestamps.
 * - Pure transformations driven only by inputs.
 * - Final model is normalized using the same sanitize+migration+invariants pipeline as normal load.
 */
export function applyOperationDtoToModel(model: Model, op: OperationDto): Model {
  switch (op.type as OperationType) {
    case 'SNAPSHOT_REPLACE': {
      return normalizeModel(op.payload);
    }
    case 'JSON_PATCH': {
      const patch = op.payload as JsonPatchOp[];
      const patched = applyJsonPatch(model as unknown, patch) as unknown;
      return normalizeModel(patched);
    }
    default: {
      // Unknown op type => ignore (forward-compatible)
      return model;
    }
  }
}

function normalizeModel(payload: unknown): Model {
  // Keep normalization consistent with existing load pipeline.
  // Using serialize->deserialize ensures sanitizers/migrations/invariants run.
  const json = JSON.stringify(payload);
  return deserializeModel(json);
}

export function applyOperationDtosToModel(model: Model, ops: OperationDto[]): Model {
  let next = model;
  for (const op of ops) next = applyOperationDtoToModel(next, op);
  return next;
}

/**
 * Minimal RFC6902 (JSON Patch) subset: add, remove, replace.
 * This intentionally avoids external dependencies.
 */
export function applyJsonPatch(target: unknown, patch: JsonPatchOp[]): unknown {
  let next = target;
  for (const op of patch) {
    if (op.op === 'add') next = patchAdd(next, op.path, op.value);
    else if (op.op === 'remove') next = patchRemove(next, op.path);
    else if (op.op === 'replace') next = patchReplace(next, op.path, op.value);
    else {
      // ignore unsupported ops (move/copy/test) for forward compatibility
      continue;
    }
  }
  return next;
}

function decodePointer(path: string): string[] {
  if (path === '') return [];
  if (!path.startsWith('/')) throw new Error(`Invalid JSON pointer: ${path}`);
  return path
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function patchAdd(target: unknown, path: string, value: unknown): unknown {
  const tokens = decodePointer(path);
  return setAtPath(target, tokens, value, 'add');
}

function patchReplace(target: unknown, path: string, value: unknown): unknown {
  const tokens = decodePointer(path);
  return setAtPath(target, tokens, value, 'replace');
}

function patchRemove(target: unknown, path: string): unknown {
  const tokens = decodePointer(path);
  return setAtPath(target, tokens, undefined, 'remove');
}

type SetMode = 'add' | 'replace' | 'remove';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function cloneContainer(v: unknown): unknown {
  if (isArray(v)) return v.slice();
  if (isObject(v)) return { ...v };
  return v;
}

function setAtPath(target: unknown, tokens: string[], value: unknown, mode: SetMode): unknown {
  if (tokens.length === 0) {
    // whole-document operation
    if (mode === 'remove') return undefined;
    return value;
  }

  const rootClone = cloneContainer(target);
  return setAtPathRec(rootClone, target, tokens, value, mode);
}

function setAtPathRec(
  currentClone: unknown,
  currentOriginal: unknown,
  tokens: string[],
  value: unknown,
  mode: SetMode,
): unknown {
  const [head, ...rest] = tokens;

  if (isArray(currentClone)) {
    const arrClone = currentClone;
    const arrOrig = isArray(currentOriginal) ? currentOriginal : [];
    if (rest.length === 0) {
      if (head === '-') {
        if (mode === 'remove') throw new Error(`Cannot remove '-' from array pointer`);
        arrClone.push(value);
        return arrClone;
      }
      const idx = parseArrayIndex(head, arrClone.length);
      if (mode === 'remove') {
        arrClone.splice(idx, 1);
      } else if (mode === 'add') {
        // RFC6902 add inserts at index
        arrClone.splice(idx, 0, value);
      } else {
        arrClone[idx] = value;
      }
      return arrClone;
    }

    const idx = head === '-' ? arrClone.length : parseArrayIndex(head, arrClone.length);
    const childOrig = idx < arrOrig.length ? arrOrig[idx] : undefined;
    const childClone = cloneContainer(idx < arrClone.length ? arrClone[idx] : childOrig);
    const updatedChild = setAtPathRec(childClone, childOrig, rest, value, mode);

    if (idx === arrClone.length) arrClone.push(updatedChild);
    else arrClone[idx] = updatedChild;

    return arrClone;
  }

  if (isObject(currentClone)) {
    const objClone = currentClone;
    const objOrig = isObject(currentOriginal) ? currentOriginal : {};
    if (rest.length === 0) {
      if (mode === 'remove') {
        delete objClone[head];
      } else {
        objClone[head] = value;
      }
      return objClone;
    }

    const childOrig = objOrig[head];
    const existingChild = objClone[head];
    const childClone = cloneContainer(existingChild ?? childOrig);
    const updatedChild = setAtPathRec(childClone, childOrig, rest, value, mode);
    objClone[head] = updatedChild;
    return objClone;
  }

  // If we reach here, we're trying to traverse into a primitive => treat as creating containers along the way.
  const nextContainer: unknown = shouldBeArray(rest[0]) ? [] : {};
  const containerClone = cloneContainer(nextContainer);
  // Re-run with a container at this position.
  return setAtPathRec(containerClone, undefined, tokens, value, mode);
}

function shouldBeArray(nextToken: string | undefined): boolean {
  if (!nextToken) return false;
  if (nextToken === '-') return true;
  return /^[0-9]+$/.test(nextToken);
}

function parseArrayIndex(token: string, length: number): number {
  if (!/^[0-9]+$/.test(token)) throw new Error(`Invalid array index in JSON pointer: ${token}`);
  const idx = Number(token);
  if (!Number.isFinite(idx)) throw new Error(`Invalid array index in JSON pointer: ${token}`);
  // allow idx==length for add-insert at end
  if (idx < 0 || idx > length) throw new Error(`Array index out of bounds: ${token}`);
  return idx;
}
