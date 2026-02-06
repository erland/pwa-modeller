export type SlideNodeInfo = {
  elementId: string;
  /** The PowerPoint shape id (p:cNvPr/@id) */
  shapeId: number;
  /** Shape bounds in EMUs (English Metric Units) from a:xfrm */
  emu: { x: number; y: number; cx: number; cy: number } | null;
  /** Optional alt text payload */
  altText: string;
};

export type SlideNodeMap = Record<string, SlideNodeInfo>;

function readNumAttr(el: Element | null, name: string): number | null {
  if (!el) return null;
  const v = el.getAttribute(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function findFirstByLocalName(root: Element, localName: string): Element | null {
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === localName) return el;
    for (let i = 0; i < el.children.length; i++) stack.push(el.children[i]);
  }
  return null;
}

function findAllByLocalName(root: Element, localName: string): Element[] {
  const out: Element[] = [];
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === localName) out.push(el);
    for (let i = 0; i < el.children.length; i++) stack.push(el.children[i]);
  }
  return out;
}

function extractAltText(cNvPr: Element): string {
  // In PresentationML, alt text can be stored in descr and sometimes title.
  return (cNvPr.getAttribute('descr') ?? cNvPr.getAttribute('title') ?? '').trim();
}

function parseElementIdFromAltText(altText: string): string | null {
  const idx = altText.indexOf('EA_NODE:');
  if (idx < 0) return null;
  const rest = altText.slice(idx + 'EA_NODE:'.length).trim();
  if (!rest) return null;
  // Stop at whitespace if user added more text
  return rest.split(/\s+/)[0];
}

export function buildNodeMapFromSlideXml(slideXml: string): SlideNodeMap {
  const map: SlideNodeMap = {};
  if (typeof DOMParser === 'undefined') return map;

  const doc = new DOMParser().parseFromString(slideXml, 'application/xml');
  const root = doc.documentElement;
  if (!root) return map;

  // Shapes are usually p:sp under p:spTree, but we traverse generically by localName.
  const shapes = findAllByLocalName(root, 'sp');
  for (const sp of shapes) {
    const cNvPr = findFirstByLocalName(sp, 'cNvPr');
    if (!cNvPr) continue;

    const altText = extractAltText(cNvPr);
    const elementId = parseElementIdFromAltText(altText);
    if (!elementId) continue;

    const sid = readNumAttr(cNvPr, 'id');
    if (sid === null) continue;

    const xfrm = findFirstByLocalName(sp, 'xfrm');
    const off = xfrm ? findFirstByLocalName(xfrm, 'off') : null;
    const ext = xfrm ? findFirstByLocalName(xfrm, 'ext') : null;

    const x = readNumAttr(off, 'x');
    const y = readNumAttr(off, 'y');
    const cx = readNumAttr(ext, 'cx');
    const cy = readNumAttr(ext, 'cy');

    map[elementId] = {
      elementId,
      shapeId: sid,
      emu: x !== null && y !== null && cx !== null && cy !== null ? { x, y, cx, cy } : null,
      altText,
    };
  }

  return map;
}
