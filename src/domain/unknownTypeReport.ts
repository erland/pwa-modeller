import type { Model, UnknownTypeInfo } from './types';

export interface UnknownTypeCounts {
  /** Total number of entities with type === 'Unknown'. */
  total: number;
  /** Count by "ns:name" (or just "name" when ns is not present). */
  byType: Record<string, number>;
}

export interface UnknownTypesReport {
  elements: UnknownTypeCounts;
  relationships: UnknownTypeCounts;
  /** Convenience flag: true if any unknown types exist. */
  hasUnknown: boolean;
}

function labelForUnknownType(info?: UnknownTypeInfo): string {
  const name = (info?.name ?? 'Unknown').trim() || 'Unknown';
  const ns = (info?.ns ?? '').trim();
  return ns ? `${ns}:${name}` : name;
}

function emptyCounts(): UnknownTypeCounts {
  return { total: 0, byType: {} };
}

function bump(counts: UnknownTypeCounts, key: string): void {
  counts.total += 1;
  counts.byType[key] = (counts.byType[key] ?? 0) + 1;
}

/**
 * Collects unknown element/relationship types present in a model.
 *
 * This is intended to:
 * - populate import reports ("imported with unknown types")
 * - drive export policy checks (strict vs best-effort)
 */
export function collectUnknownTypes(model: Model): UnknownTypesReport {
  const elements = emptyCounts();
  const relationships = emptyCounts();

  for (const el of Object.values(model.elements)) {
    if (el.type === 'Unknown') {
      bump(elements, labelForUnknownType(el.unknownType));
    }
  }

  for (const rel of Object.values(model.relationships)) {
    if (rel.type === 'Unknown') {
      bump(relationships, labelForUnknownType(rel.unknownType));
    }
  }

  return {
    elements,
    relationships,
    hasUnknown: elements.total > 0 || relationships.total > 0
  };
}
