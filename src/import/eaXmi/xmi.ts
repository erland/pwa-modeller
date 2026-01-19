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
  const v = attrAny(el, [...XMI_TYPE]);
  const s = v?.trim();
  return s ? s : undefined;
}
