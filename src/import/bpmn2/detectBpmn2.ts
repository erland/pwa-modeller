import { localName, parseXml, q } from './xml';

const BPMN2_MODEL_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

/**
 * Fast best-effort sniffing from text.
 *
 * Intended to run on a short decoded prefix (ctx.sniffText). It should be tolerant
 * of partial content and odd encodings.
 */
export function detectBpmn2FromText(sniffText: string): boolean {
  const t = (sniffText ?? '').toLowerCase();

  // Must contain a <definitions> element.
  if (!t.includes('<definitions') && !t.includes(':definitions')) return false;

  // Ideal case: the BPMN 2.0 model namespace is visible in the prefix snippet.
  if (t.includes(BPMN2_MODEL_NS.toLowerCase())) return true;

  // Fallback: many exporters include bpmn/bpmn2 prefixes.
  if (t.includes('bpmn:definitions') || t.includes('bpmn2:definitions')) return true;

  return false;
}

export function detectBpmn2FromXml(xmlText: string): boolean {
  try {
    const doc = parseXml(xmlText);
    return detectBpmn2FromDoc(doc);
  } catch {
    return false;
  }
}

export function detectBpmn2FromDoc(doc: Document): boolean {
  const defs = q(doc, 'definitions');
  if (!defs || localName(defs) !== 'definitions') return false;

  const xmlns = defs.getAttribute('xmlns') ?? '';
  const bpmnNs = defs.getAttribute('xmlns:bpmn') ?? defs.getAttribute('xmlns:bpmn2') ?? '';

  const combined = (xmlns + ' ' + bpmnNs).toLowerCase();
  return combined.includes(BPMN2_MODEL_NS.toLowerCase());
}
