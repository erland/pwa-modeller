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

type UmlEndMetadataAttrs = {
  sourceRole?: string;
  targetRole?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  sourceNavigable?: boolean;
  targetNavigable?: boolean;
  stereotype?: string;
};

function normalizeUmlEndMetadataAttrs(attrs: unknown): UmlEndMetadataAttrs {
  if (!attrs || typeof attrs !== 'object') return {};
  const a = attrs as Record<string, unknown>;
  return {
    sourceRole: coerceTrimmedString(a.sourceRole),
    targetRole: coerceTrimmedString(a.targetRole),
    sourceMultiplicity: coerceTrimmedString(a.sourceMultiplicity),
    targetMultiplicity: coerceTrimmedString(a.targetMultiplicity),
    sourceNavigable: typeof a.sourceNavigable === 'boolean' ? a.sourceNavigable : undefined,
    targetNavigable: typeof a.targetNavigable === 'boolean' ? a.targetNavigable : undefined,
    stereotype: coerceTrimmedString(a.stereotype),
  };
}

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

  // Preserve notation-specific attributes for BPMN types.
  if (typeof relationshipType === 'string' && relationshipType.startsWith('bpmn.')) {
    return attrs === null ? undefined : attrs;
  }

  // For UML types we preserve attrs as-is, but normalize well-known "end metadata" fields so
  // import/UI code can rely on a consistent shape.
  if (typeof relationshipType === 'string' && relationshipType.startsWith('uml.')) {
    if (attrs === null) return undefined;
    if (!attrs || typeof attrs !== 'object') return attrs;

    const original = attrs as Record<string, unknown>;
    const normalized = normalizeUmlEndMetadataAttrs(attrs);

    const next: Record<string, unknown> = { ...original };

    // Apply normalized values (and drop empty/invalid ones).
    if (normalized.sourceRole !== undefined) next.sourceRole = normalized.sourceRole;
    else delete next.sourceRole;

    if (normalized.targetRole !== undefined) next.targetRole = normalized.targetRole;
    else delete next.targetRole;

    if (normalized.sourceMultiplicity !== undefined) next.sourceMultiplicity = normalized.sourceMultiplicity;
    else delete next.sourceMultiplicity;

    if (normalized.targetMultiplicity !== undefined) next.targetMultiplicity = normalized.targetMultiplicity;
    else delete next.targetMultiplicity;

    if (typeof normalized.sourceNavigable === 'boolean') next.sourceNavigable = normalized.sourceNavigable;
    else delete next.sourceNavigable;

    if (typeof normalized.targetNavigable === 'boolean') next.targetNavigable = normalized.targetNavigable;
    else delete next.targetNavigable;

    if (normalized.stereotype !== undefined) next.stereotype = normalized.stereotype;
    else delete next.stereotype;

    return Object.keys(next).length ? next : undefined;
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
