import type { ElementType, RelationshipType } from '../../domain/types';
import type { UnknownTypeInfo } from '../../domain/types';
import { ELEMENT_TYPES_BY_LAYER, RELATIONSHIP_TYPES } from '../../domain/config/archimatePalette';

export type TypeMappingResult<T extends string> =
  | { kind: 'known'; type: T }
  | { kind: 'unknown'; type: 'Unknown'; unknown: UnknownTypeInfo };

function stripNamespace(raw: string): string {
  const s = raw.trim();
  // Keep the last segment after common namespace separators.
  const lastColon = s.lastIndexOf(':');
  const lastDot = s.lastIndexOf('.');
  const lastHash = s.lastIndexOf('#');
  const cut = Math.max(lastColon, lastDot, lastHash);
  return cut >= 0 ? s.slice(cut + 1) : s;
}

function normalizeKey(raw: string): string {
  // Remove whitespace/punctuation and lowercase.
  // (Avoid unicode property escapes for broad TS/JS compatibility.)
  return raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function normalizeTypeToken(raw: string): string {
  let s = stripNamespace(raw);

  // MEFF/XMI sometimes use suffixes like "AssociationRelationship".
  s = s.replace(/relationship$/i, '');
  s = s.replace(/element$/i, '');

  return normalizeKey(s);
}

function buildLookup<T extends string>(values: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const v of values) {
    m.set(normalizeTypeToken(v), v);
  }
  return m;
}

const KNOWN_ELEMENT_TYPES: ElementType[] = (() => {
  const all: ElementType[] = [];
  for (const types of Object.values(ELEMENT_TYPES_BY_LAYER)) {
    for (const t of types) all.push(t);
  }
  return all;
})();

const ELEMENT_LOOKUP = buildLookup(KNOWN_ELEMENT_TYPES);
const REL_LOOKUP = buildLookup(RELATIONSHIP_TYPES);

/**
 * Map a raw ArchiMate element type token (from MEFF/XMI/etc) to the app's canonical ElementType.
 *
 * - If the token is recognized (including common variants like "Business Actor" / "Business-Actor"),
 *   returns kind="known".
 * - Otherwise returns kind="unknown" and includes UnknownTypeInfo preserving the original token.
 */
export function mapElementType(rawType: string, source: string): TypeMappingResult<ElementType> {
  const raw = (rawType ?? '').trim();
  if (!raw) {
    return { kind: 'unknown', type: 'Unknown', unknown: { source, name: 'MissingType' } };
  }

  // Special-case: if already exactly one of our known strings, accept directly.
  if (KNOWN_ELEMENT_TYPES.includes(raw as ElementType)) {
    return { kind: 'known', type: raw as ElementType };
  }

  const key = normalizeTypeToken(raw);
  const mapped = ELEMENT_LOOKUP.get(key);
  if (mapped) return { kind: 'known', type: mapped };

  return { kind: 'unknown', type: 'Unknown', unknown: { source, name: raw } };
}

/**
 * Map a raw ArchiMate relationship type token (from MEFF/XMI/etc) to the app's canonical RelationshipType.
 */
export function mapRelationshipType(rawType: string, source: string): TypeMappingResult<RelationshipType> {
  const raw = (rawType ?? '').trim();
  if (!raw) {
    return { kind: 'unknown', type: 'Unknown', unknown: { source, name: 'MissingType' } };
  }

  if ((RELATIONSHIP_TYPES as readonly string[]).includes(raw)) {
    return { kind: 'known', type: raw as RelationshipType };
  }

  const key = normalizeTypeToken(raw);

  // Accept variants like "AssociationRelationship".
  const mapped = REL_LOOKUP.get(key);
  if (mapped) return { kind: 'known', type: mapped as RelationshipType };

  return { kind: 'unknown', type: 'Unknown', unknown: { source, name: raw } };
}

/**
 * Convenience helper: returns a canonical type string for IR.
 * - known => canonical
 * - unknown => returns original token (so applyImportIR can preserve it in unknownType info)
 */
export function canonicalizeElementTypeForIR(rawType: string, source: string): string {
  const res = mapElementType(rawType, source);
  return res.kind === 'known' ? res.type : (rawType ?? '').trim() || 'Unknown';
}

export function canonicalizeRelationshipTypeForIR(rawType: string, source: string): string {
  const res = mapRelationshipType(rawType, source);
  return res.kind === 'known' ? res.type : (rawType ?? '').trim() || 'Unknown';
}
