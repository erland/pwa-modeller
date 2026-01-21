import { attrAny, childText, localName } from '../../framework/xml';

/**
 * Collect properties/tagged-value-like data emitted by MEFF exporters.
 * Kept permissive to maximize real-world compatibility.
 */
export function parsePropertiesToRecord(el: Element): Record<string, string> | undefined {
  // Common patterns:
  // - <properties><property key="k" value="v"/></properties>
  // - <properties><property propertyDefinitionRef="…" value="…"/></properties>
  // - <property key="…" value="…"/>
  const props: Record<string, string> = {};

  const collectFromProperty = (p: Element) => {
    const key =
      attrAny(p, ['key', 'name', 'propertydefinitionref', 'propertyDefinitionRef', 'ref', 'identifierRef']) ??
      childText(p, 'key') ??
      childText(p, 'name');
    const value = attrAny(p, ['value']) ?? childText(p, 'value') ?? (p.textContent?.trim() ?? '');
    if (key && value) props[key] = value;
  };

  // First: <properties> container(s)
  for (const c of Array.from(el.children)) {
    if (localName(c) === 'properties') {
      for (const p of Array.from(c.children)) {
        if (localName(p) === 'property') collectFromProperty(p);
      }
    }
  }
  // Also allow direct <property> children
  for (const c of Array.from(el.children)) {
    if (localName(c) === 'property') collectFromProperty(c);
  }

  return Object.keys(props).length ? props : undefined;
}
