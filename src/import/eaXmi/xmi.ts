import { attrAny } from '../framework/xml';

/**
 * Namespace-tolerant XMI attribute names.
 *
 * Sparx EA (and other tools) may emit attributes with or without prefixes
 * depending on export settings and XML serializer.
 */

export const XMI_ID = ['xmi:id', 'id'] as const;
export const XMI_IDREF = ['xmi:idref', 'idref'] as const;
export const XMI_TYPE = ['xmi:type', 'type'] as const;
export const HREF = ['href'] as const;

export function getXmiId(el: Element): string | undefined {
  const v = attrAny(el, [...XMI_ID]);
  const s = v?.trim();
  return s ? s : undefined;
}

export function getXmiIdRef(el: Element): string | undefined {
  const v = attrAny(el, [...XMI_IDREF]);
  const s = v?.trim();
  return s ? s : undefined;
}

export function getXmiType(el: Element): string | undefined {
  // Prefer the real XMI attribute.
  const explicit = attrAny(el, ['xmi:type'])?.trim();
  if (explicit) return explicit;

  // Some exporters omit the "xmi:" prefix. However, other parts of the document (notably
  // EA's <xmi:Extension> blocks) also use a plain "type" attribute for non-XMI meanings
  // (e.g. diagram type="Class"), which should NOT be interpreted as an XMI metaclass.
  //
  // Heuristic: only accept plain "type" when it *looks* like a qualified XMI type.
  // Typical form: "uml:Class", "sysml:Block", etc.
  const loose = attrAny(el, ['type'])?.trim();
  if (loose && loose.includes(':')) return loose;

  return undefined;
}
