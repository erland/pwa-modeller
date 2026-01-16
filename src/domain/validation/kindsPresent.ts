import type { Model, ModelKind } from '../types';
import { kindFromTypeId } from '../kindFromTypeId';

/**
 * Derive which model kinds (notations) are present in a model.
 *
 * We intentionally look at:
 *  - view.kind (always explicit)
 *  - element.kind (if provided) else infer from element.type
 *  - relationship.kind (if provided) else infer from relationship.type
 *
 * This supports mixed models and imported "Unknown" types where the explicit `kind`
 * should be considered authoritative.
 */
export function kindsPresent(model: Model): Set<ModelKind> {
  const kinds = new Set<ModelKind>();

  for (const v of Object.values(model.views ?? {})) {
    if (v?.kind) kinds.add(v.kind);
  }

  for (const el of Object.values(model.elements ?? {})) {
    kinds.add(el.kind ?? kindFromTypeId(el.type));
  }

  for (const rel of Object.values(model.relationships ?? {})) {
    kinds.add(rel.kind ?? kindFromTypeId(rel.type));
  }

  // Keep prior behavior stable for empty models.
  if (kinds.size === 0) kinds.add('archimate');

  return kinds;
}

export function effectiveKind(kind: ModelKind | undefined, typeId: string | undefined | null): ModelKind {
  return kind ?? kindFromTypeId(typeId);
}
