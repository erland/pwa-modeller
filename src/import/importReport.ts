import type { Model } from '../domain';
import type { UnknownTypeInfo } from '../domain/types';

export type ImportUnknownCounts = Record<string, number>;

export interface ImportReport {
  /** A short hint about where the data came from (e.g. 'json', 'archimate-exchange', 'ea-xmi'). */
  source: string;
  warnings: string[];
  unknownElementTypes: ImportUnknownCounts;
  unknownRelationshipTypes: ImportUnknownCounts;
}

export function createImportReport(source: string): ImportReport {
  return {
    source,
    warnings: [],
    unknownElementTypes: {},
    unknownRelationshipTypes: {}
  };
}

function keyForUnknown(info: UnknownTypeInfo): string {
  const ns = (info.ns ?? '').trim();
  const name = (info.name ?? '').trim() || 'Unknown';
  return ns ? `${ns}:${name}` : name;
}

function bump(map: ImportUnknownCounts, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function recordUnknownElementType(report: ImportReport, info: UnknownTypeInfo) {
  bump(report.unknownElementTypes, keyForUnknown(info));
}

export function recordUnknownRelationshipType(report: ImportReport, info: UnknownTypeInfo) {
  bump(report.unknownRelationshipTypes, keyForUnknown(info));
}

export function addWarning(report: ImportReport, warning: string) {
  if (!warning) return;
  report.warnings.push(warning);
}

export function hasImportWarnings(report: ImportReport): boolean {
  return (
    report.warnings.length > 0 ||
    Object.keys(report.unknownElementTypes).length > 0 ||
    Object.keys(report.unknownRelationshipTypes).length > 0
  );
}

/**
 * Useful for "format-agnostic" imports: even if we didn't actively map types during parsing,
 * we can still scan the resulting model and tell the user if it contains unknown types.
 */
export function scanModelForUnknownTypes(model: Model, source = 'model'): ImportReport | null {
  const report = createImportReport(source);

  for (const el of Object.values(model.elements)) {
    if (el.type === 'Unknown') {
      recordUnknownElementType(report, el.unknownType ?? { name: 'Unknown' });
    }
  }

  for (const rel of Object.values(model.relationships)) {
    if (rel.type === 'Unknown') {
      recordUnknownRelationshipType(report, rel.unknownType ?? { name: 'Unknown' });
    }
  }

  return hasImportWarnings(report) ? report : null;
}

export function formatUnknownCounts(counts: ImportUnknownCounts): Array<[string, number]> {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
