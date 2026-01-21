import type { IRTaggedValue } from '../../framework/ir';
import { attrAny, localName } from '../../framework/xml';

/**
 * Parse tagged values from a MEFF element or relationship node.
 * Kept permissive: different exporters use different tag shapes.
 */
export function parseTaggedValues(el: Element): IRTaggedValue[] | undefined {
  // Some exporters represent tagged values as:
  // - <taggedValues><taggedValue key="k" value="v"/></taggedValues>
  // - <properties> … </properties> (handled separately as properties)
  const out: IRTaggedValue[] = [];

  const addKV = (key: string | null, value: string | null) => {
    const k = (key ?? '').trim();
    const v = (value ?? '').trim();
    if (k && v) out.push({ key: k, value: v });
  };

  for (const c of Array.from(el.children)) {
    const ln = localName(c);
    if (ln === 'taggedvalues') {
      for (const tv of Array.from(c.children)) {
        if (localName(tv) !== 'taggedvalue') continue;
        addKV(attrAny(tv, ['key', 'name']), attrAny(tv, ['value']) ?? tv.textContent);
      }
    } else if (ln === 'taggedvalue') {
      addKV(attrAny(c, ['key', 'name']), attrAny(c, ['value']) ?? c.textContent);
    }
  }

  return out.length ? out : undefined;
}
