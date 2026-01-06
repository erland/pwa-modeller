import { AccessType, RelationshipAttributes, RelationshipType } from './types';

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

/**
 * Normalize/clean relationship attributes so they are consistent with the
 * relationship type.
 *
 * Rules:
 * - Access: only keep `accessType` and only if it is valid.
 * - Association: only keep `isDirected` if it is a boolean.
 * - Influence: only keep `influenceStrength` if it is a non-empty string.
 * - All other relationship types: drop all attributes.
 */
export function sanitizeRelationshipAttrs(
  relationshipType: RelationshipType,
  attrs?: RelationshipAttributes
): RelationshipAttributes | undefined {
  if (!attrs) return undefined;

  const next: RelationshipAttributes = {};

  if (relationshipType === 'Access') {
    if (isValidAccessType(attrs.accessType)) {
      next.accessType = attrs.accessType;
    }
  } else if (relationshipType === 'Association') {
    if (typeof attrs.isDirected === 'boolean') {
      next.isDirected = attrs.isDirected;
    }
  } else if (relationshipType === 'Influence') {
    const strength = coerceTrimmedString((attrs as any).influenceStrength);
    if (strength) {
      next.influenceStrength = strength;
    }
  }

  return Object.keys(next).length ? next : undefined;
}
