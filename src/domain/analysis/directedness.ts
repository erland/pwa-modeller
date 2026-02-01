// Shared helpers for interpreting directedness flags across analysis features.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Notation-agnostic: if attrs contains an explicit `isDirected: false` flag,
 * treat the relationship as undirected.
 */
export function isExplicitlyUndirected(attrs: unknown): boolean {
  if (!isRecord(attrs)) return false;
  return attrs.isDirected === false;
}
