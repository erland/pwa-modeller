import type { AccessType, RelationshipType } from './types';

const ACCESS_TYPES: ReadonlySet<AccessType> = new Set(['Access', 'Read', 'Write', 'ReadWrite']);

function isValidAccessType(v: unknown): v is AccessType {
  return typeof v === 'string' && ACCESS_TYPES.has(v as AccessType);
}

function coerceTrimmedString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = typeof v === 'string' ? v : String(v);
  const t = s.trim();
  return t.length ? t : undefined;
}

type ArchimateRelAttrs = {
  accessType?: AccessType;
  isDirected?: boolean;
  influenceStrength?: string;
};

function normalizeArchimateAttrs(attrs: unknown): ArchimateRelAttrs {
  if (!attrs || typeof attrs !== 'object') return {};
  const a = attrs as Record<string, unknown>;
  return {
    accessType: isValidAccessType(a.accessType) ? (a.accessType as AccessType) : undefined,
    isDirected: typeof a.isDirected === 'boolean' ? a.isDirected : undefined,
    influenceStrength: coerceTrimmedString(a.influenceStrength)
  };
}

/**
 * Normalize/clean relationship attributes so they are consistent with the
 * relationship type.
 *
 * - For ArchiMate relationship types, we keep only the supported fields and drop the rest.
 * - For non-ArchiMate (e.g. "uml.*" / "bpmn.*"), we preserve attrs as-is (notation will interpret it).
 */
export function sanitizeRelationshipAttrs(relationshipType: RelationshipType, attrs?: unknown): unknown | undefined {
  if (attrs === undefined) return undefined;

  // Preserve notation-specific attributes for non-ArchiMate types.
  if (typeof relationshipType === 'string' && (relationshipType.startsWith('uml.') || relationshipType.startsWith('bpmn.'))) {
    return attrs === null ? undefined : attrs;
  }

  // ArchiMate normalization
  const a = normalizeArchimateAttrs(attrs);
  const next: Record<string, unknown> = {};

  if (relationshipType === 'Access') {
    if (a.accessType) next.accessType = a.accessType;
  } else if (relationshipType === 'Association') {
    if (typeof a.isDirected === 'boolean') next.isDirected = a.isDirected;
  } else if (relationshipType === 'Influence') {
    if (a.influenceStrength) next.influenceStrength = a.influenceStrength;
  }

  return Object.keys(next).length ? next : undefined;
}
