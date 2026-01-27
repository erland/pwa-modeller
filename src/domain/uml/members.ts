import type { Element } from '../types';

export type UmlVisibility = 'public' | 'private' | 'protected' | 'package';

export type UmlParameter = {
  name: string;
  type?: string;
};

export type UmlMultiplicity = {
  lower?: string;
  upper?: string;
};

export type UmlAttribute = {
  name: string;
  /**
   * Attribute datatype display string (legacy).
   *
   * Note: this historically stores the rendered datatype name.
   */
  type?: string;
  /** Raw XMI reference id for the datatype (if available). */
  typeRef?: string;
  /** Resolved datatype name (if available). */
  typeName?: string;
  /** Multiplicity for the attribute (if available). */
  multiplicity?: UmlMultiplicity;
  visibility?: UmlVisibility;
  isStatic?: boolean;
  defaultValue?: string;
};

export type UmlOperation = {
  name: string;
  returnType?: string;
  visibility?: UmlVisibility;
  params?: UmlParameter[];
  isStatic?: boolean;
  isAbstract?: boolean;
};

export type UmlClassifierMembers = {
  attributes: UmlAttribute[];
  operations: UmlOperation[];
};

export type UmlMembersCoerceOptions = {
  /**
   * When true, keep members with empty name strings (useful for editing UI).
   * When false (default), empty-name entries are dropped.
   */
  includeEmptyNames?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function trimString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function optString(v: unknown): string | undefined {
  const s = trimString(v);
  return s.length ? s : undefined;
}

function coerceMultiplicity(raw: unknown): UmlMultiplicity | undefined {
  if (!isRecord(raw)) return undefined;
  const lower = optString(raw.lower);
  const upper = optString(raw.upper);
  if (!lower && !upper) return undefined;
  const out: UmlMultiplicity = {};
  if (lower) out.lower = lower;
  if (upper) out.upper = upper;
  return out;
}

export function asUmlVisibility(v: unknown): UmlVisibility | undefined {
  switch (v) {
    case 'public':
    case 'private':
    case 'protected':
    case 'package':
      return v;
  }
  return undefined;
}

function coerceParams(raw: unknown, options: UmlMembersCoerceOptions): UmlParameter[] {
  if (!Array.isArray(raw)) return [];
  const out: UmlParameter[] = [];
  for (const p of raw) {
    if (!isRecord(p)) continue;
    const name = trimString(p.name);
    if (!options.includeEmptyNames && !name) continue;
    out.push({
      name,
      type: optString(p.type),
    });
  }
  return out;
}

/**
 * Coerces UML classifier members from an attrs object.
 *
 * This is intentionally permissive and suitable for UI editing.
 */
export function coerceUmlClassifierMembersFromAttrs(
  rawAttrs: unknown,
  options: UmlMembersCoerceOptions = {},
): UmlClassifierMembers {
  if (!isRecord(rawAttrs)) return { attributes: [], operations: [] };

  const attributes: UmlAttribute[] = [];
  const operations: UmlOperation[] = [];

  const rawAttributes = rawAttrs.attributes;
  if (Array.isArray(rawAttributes)) {
    for (const a of rawAttributes) {
      if (!isRecord(a)) continue;
      const name = trimString(a.name);
      if (!options.includeEmptyNames && !name) continue;
      attributes.push({
        name,
        type: optString(a.type),
        typeRef: optString((a as Record<string, unknown>).typeRef),
        typeName: optString((a as Record<string, unknown>).typeName),
        multiplicity: coerceMultiplicity((a as Record<string, unknown>).multiplicity),
        visibility: asUmlVisibility(a.visibility),
        isStatic: typeof a.isStatic === 'boolean' ? a.isStatic : undefined,
        defaultValue: optString(a.defaultValue),
      });
    }
  }

  const rawOperations = rawAttrs.operations;
  if (Array.isArray(rawOperations)) {
    for (const o of rawOperations) {
      if (!isRecord(o)) continue;
      const name = trimString(o.name);
      if (!options.includeEmptyNames && !name) continue;
      operations.push({
        name,
        returnType: optString(o.returnType),
        visibility: asUmlVisibility(o.visibility),
        params: coerceParams(o.params, options),
        isStatic: typeof o.isStatic === 'boolean' ? o.isStatic : undefined,
        isAbstract: typeof o.isAbstract === 'boolean' ? o.isAbstract : undefined,
      });
    }
  }

  return { attributes, operations };
}

export function readUmlClassifierMembers(
  element: Element,
  options: UmlMembersCoerceOptions = {},
): UmlClassifierMembers {
  return coerceUmlClassifierMembersFromAttrs(element.attrs, options);
}

/**
 * Strict sanitization for persisted/imported data.
 *
 * - Trims all string fields
 * - Drops empty-name members
 * - Drops empty params
 */
export function sanitizeUmlClassifierMembersFromAttrs(rawAttrs: unknown): UmlClassifierMembers {
  const members = coerceUmlClassifierMembersFromAttrs(rawAttrs, { includeEmptyNames: false });

  // Important: do not "enrich" persisted data with explicit `undefined` fields.
  // Round-trips should preserve shape, and import should only store meaningful keys.
  const attributes: UmlAttribute[] = [];
  for (const a of members.attributes) {
    const name = a.name.trim();
    if (!name) continue;
    const out: UmlAttribute = { name };
    const type = a.type?.trim();
    if (type) out.type = type;
    const typeRef = a.typeRef?.trim();
    if (typeRef) out.typeRef = typeRef;
    const typeName = a.typeName?.trim();
    if (typeName) out.typeName = typeName;
    const lower = a.multiplicity?.lower?.trim();
    const upper = a.multiplicity?.upper?.trim();
    if (lower || upper) {
      const m: UmlMultiplicity = {};
      if (lower) m.lower = lower;
      if (upper) m.upper = upper;
      out.multiplicity = m;
    }
    if (a.visibility) out.visibility = a.visibility;
    if (typeof a.isStatic === 'boolean') out.isStatic = a.isStatic;
    const dv = a.defaultValue?.trim();
    if (dv) out.defaultValue = dv;
    attributes.push(out);
  }

  const operations: UmlOperation[] = [];
  for (const o of members.operations) {
    const name = o.name.trim();
    if (!name) continue;
    const out: UmlOperation = { name };
    const rt = o.returnType?.trim();
    if (rt) out.returnType = rt;
    if (o.visibility) out.visibility = o.visibility;

    const params: UmlParameter[] = [];
    for (const p of o.params ?? []) {
      const pn = p.name.trim();
      if (!pn) continue;
      const po: UmlParameter = { name: pn };
      const pt = p.type?.trim();
      if (pt) po.type = pt;
      params.push(po);
    }
    if (params.length) out.params = params;

    if (typeof o.isStatic === 'boolean') out.isStatic = o.isStatic;
    if (typeof o.isAbstract === 'boolean') out.isAbstract = o.isAbstract;
    operations.push(out);
  }

  return { attributes, operations };
}

export function applyUmlClassifierMembersToAttrs(
  base: Record<string, unknown>,
  members: UmlClassifierMembers,
): Record<string, unknown> {
  // Store a compact form without explicit undefined fields.
  const compact = sanitizeUmlClassifierMembersFromAttrs(members);
  return { ...base, attributes: compact.attributes, operations: compact.operations };
}

export function sanitizeUmlClassifierAttrs(rawAttrs: unknown): Record<string, unknown> | undefined {
  if (!isRecord(rawAttrs)) return undefined;

  const base: Record<string, unknown> = { ...rawAttrs };
  const members = sanitizeUmlClassifierMembersFromAttrs(rawAttrs);
  base.attributes = members.attributes;
  base.operations = members.operations;
  return base;
}
