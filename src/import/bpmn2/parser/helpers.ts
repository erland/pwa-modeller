import { childByLocalName, localName } from '../xml';

export function bpmnTypeForRelLocalName(nameLc: string): string | null {
  switch (nameLc) {
    case 'sequenceflow':
      return 'bpmn.sequenceFlow';
    case 'messageflow':
      return 'bpmn.messageFlow';
    case 'association':
      return 'bpmn.association';
    case 'datainputassociation':
      return 'bpmn.dataInputAssociation';
    case 'dataoutputassociation':
      return 'bpmn.dataOutputAssociation';
    default:
      return null;
  }
}

export function defaultName(typeId: string, id: string): string {
  // Names are required by the domain factories, so always provide a fallback.
  const short = typeId.replace(/^bpmn\./, '');
  return `${short} (${id})`;
}

/**
 * Extract a small summary of <extensionElements> tags (best-effort).
 * This is useful for troubleshooting and round-tripping vendor metadata.
 */
export function extractExtensionSummary(el: Element): Record<string, string> | undefined {
  const ext = childByLocalName(el, 'extensionElements');
  if (!ext) return undefined;

  const out: Record<string, string> = {};
  let count = 0;
  const max = 50;

  const add = (key: string, value: string) => {
    if (count >= max) return;
    const k = key.trim();
    const v = value.trim();
    if (!k || !v) return;
    if (k.length > 80) return;
    if (v.length > 500) return;
    if (out[k] != null) return;
    out[k] = v;
    count += 1;
  };

  const captureFrom = (prefix: string, node: Element) => {
    // Attributes
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      if (!name) continue;
      add(`${prefix}@${name}`, a.value);
    }
    // Text content
    const t = (node.textContent ?? '').trim();
    if (t) add(`${prefix}#text`, t);
  };

  for (const c of Array.from(ext.children)) {
    const ln = localName(c);
    captureFrom(ln, c);

    // Shallow grandchildren (EA often nests a level).
    for (const gc of Array.from(c.children)) {
      const ln2 = `${ln}.${localName(gc)}`;
      captureFrom(ln2, gc);
      if (count >= max) break;
    }
    if (count >= max) break;
  }

  return Object.keys(out).length ? out : undefined;
}
