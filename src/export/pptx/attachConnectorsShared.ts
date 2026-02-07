import { inchToEmu, type PptxEmuRect, type PptxEdgeMeta } from './pptxPostProcessMeta';
import {
  createEl,
  findAllByLocalName,
  findFirstByLocalName,
  readNumAttr,
} from './xmlDom';

export type ConnectorReplaceResult = {
  xml: string;
  replacedCount: number;
  skippedCount: number;
  notes: string[];
};

export function getSpTree(doc: Document): Element | null {
  const root = doc.documentElement;
  const cSld = findFirstByLocalName(root, 'cSld');
  if (!cSld) return null;
  return findFirstByLocalName(cSld, 'spTree');
}

export function getShapeId(sp: Element): number | null {
  const cNvPr = findFirstByLocalName(sp, 'cNvPr');
  if (!cNvPr) return null;
  const id = Number(cNvPr.getAttribute('id') ?? '0');
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function getShapeName(sp: Element): string {
  const cNvPr = findFirstByLocalName(sp, 'cNvPr');
  return (cNvPr?.getAttribute('name') ?? '').trim();
}

export function getShapeDescr(sp: Element): string {
  const cNvPr = findFirstByLocalName(sp, 'cNvPr');
  return (cNvPr?.getAttribute('descr') ?? '').trim();
}

export function getShapeMarker(sp: Element): string {
  const d = getShapeDescr(sp);
  if (d) return d;
  return getShapeName(sp);
}

export function getPrstGeomPrst(sp: Element): string | null {
  const spPr = findFirstByLocalName(sp, 'spPr');
  if (!spPr) return null;
  const geom = findFirstByLocalName(spPr, 'prstGeom');
  if (!geom) return null;
  const prst = (geom.getAttribute('prst') ?? '').trim();
  return prst || null;
}

export function getXfrmRectEmu(sp: Element): PptxEmuRect | null {
  const spPr = findFirstByLocalName(sp, 'spPr');
  if (!spPr) return null;
  const xfrm = findFirstByLocalName(spPr, 'xfrm');
  if (!xfrm) return null;
  const off = findFirstByLocalName(xfrm, 'off');
  const ext = findFirstByLocalName(xfrm, 'ext');
  const x = readNumAttr(off, 'x');
  const y = readNumAttr(off, 'y');
  const cx = readNumAttr(ext, 'cx');
  const cy = readNumAttr(ext, 'cy');
  if (x === null || y === null || cx === null || cy === null) return null;
  return { x, y, cx, cy };
}

export function getLineLn(sp: Element): Element | null {
  const spPr = findFirstByLocalName(sp, 'spPr');
  if (!spPr) return null;
  return findFirstByLocalName(spPr, 'ln');
}

export function getMaxShapeId(doc: Document): number {
  let maxId = 0;
  const cNvPrs = findAllByLocalName(doc.documentElement, 'cNvPr');
  for (const c of cNvPrs) {
    const id = Number(c.getAttribute('id') ?? '0');
    if (Number.isFinite(id) && id > maxId) maxId = id;
  }
  return maxId;
}

export function center(r: PptxEmuRect): { x: number; y: number } {
  return { x: r.x + r.cx / 2, y: r.y + r.cy / 2 };
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function chooseConnIdx(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

export function readShapeRectEmu(el: Element, nsA: string): PptxEmuRect | null {
  // Works for p:sp shapes with a:xfrm/a:off + a:ext
  const xfrm = el.getElementsByTagNameNS(nsA, 'xfrm')[0];
  if (!xfrm) return null;
  const off = xfrm.getElementsByTagNameNS(nsA, 'off')[0];
  const ext = xfrm.getElementsByTagNameNS(nsA, 'ext')[0];
  if (!off || !ext) return null;

  const x = Number(off.getAttribute('x') ?? '');
  const y = Number(off.getAttribute('y') ?? '');
  const cx = Number(ext.getAttribute('cx') ?? '');
  const cy = Number(ext.getAttribute('cy') ?? '');
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { x, y, cx, cy };
}

export function cssColorToHex(color: string | undefined | null): string {
  if (!color) return '000000';
  const c = String(color).trim();

  // #RGB or #RRGGBB
  const mHex = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (mHex) {
    const h = mHex[1];
    if (h.length === 3) return (h[0]+h[0]+h[1]+h[1]+h[2]+h[2]).toUpperCase();
    return h.toUpperCase();
  }

  // rgb(…) or rgba(…)
  const mRgb = c.match(/^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (mRgb) {
    const r = Math.max(0, Math.min(255, Number(mRgb[1])));
    const g = Math.max(0, Math.min(255, Number(mRgb[2])));
    const b = Math.max(0, Math.min(255, Number(mRgb[3])));
    return [r,g,b].map((n)=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  }

  // Already bare hex?
  const mBare = c.match(/^([0-9a-fA-F]{6})$/);
  if (mBare) return mBare[1].toUpperCase();

  return '000000';
}
export function findFirstNodeInsertionIndex(spTree: Element): number {
  const children = Array.from(spTree.children);
  for (let i = 0; i < children.length; i++) {
    const el = children[i] as Element;
    if (el.localName !== 'sp') continue;
    const prst = getPrstGeomPrst(el);
    if (prst === 'roundRect' || prst === 'rect') return i;
  }
  return children.length;
}

// Marker parsing helpers moved to ./pptxMarkers (pure + unit tested)

export function findEdgeMetaById(metaEdges: PptxEdgeMeta[] | undefined, edgeId: string | undefined): PptxEdgeMeta | null {
  if (!metaEdges || !edgeId) return null;
  for (const e of metaEdges) {
    if (String(e.edgeId) === String(edgeId)) return e;
  }
  return null;
}

export function ensureDash(doc: Document, nsA: string, ln: Element, val: 'dash' | 'dot' | 'solid'): void {
  // Remove existing prstDash
  const kids = Array.from(ln.children);
  for (const k of kids) {
    if (k.localName === 'prstDash') ln.removeChild(k);
  }
  if (val === 'solid') return;

  const prstDash = createEl(doc, nsA, 'a:prstDash');
  prstDash.setAttribute('val', val);

  // PowerPoint is picky about child order in <a:ln>. Insert after <a:solidFill> if present,
  // otherwise append at the end.
  const after = Array.from(ln.children).find((k) => k.localName === 'solidFill') ?? null;
  if (after && after.nextSibling) {
    ln.insertBefore(prstDash, after.nextSibling);
  } else if (after) {
    ln.appendChild(prstDash);
  } else {
    ln.appendChild(prstDash);
  }
}

export function ensureEnd(
  doc: Document,
  nsA: string,
  ln: Element,
  which: 'headEnd' | 'tailEnd',
  type: 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval'
): void {
  const kids = Array.from(ln.children);
  for (const k of kids) {
    if (k.localName === which) ln.removeChild(k);
  }
  if (type === 'none') return;

  const el = createEl(doc, nsA, which === 'headEnd' ? 'a:headEnd' : 'a:tailEnd');
  el.setAttribute('type', type);

  if (type === 'diamond') {
    el.setAttribute('w', 'med');
    el.setAttribute('len', 'med');
  } else if (type === 'triangle' || type === 'arrow') {
    el.setAttribute('w', 'sm');
    el.setAttribute('len', 'sm');
  }

  ln.appendChild(el);
}

export function edgeMetaScore(edge: PptxEdgeMeta, lineRectEmu: PptxEmuRect): number {
  // Compare placeholder rect (inches) to actual line rect (EMU).
  const rx = inchToEmu(edge.rectIn.x);
  const ry = inchToEmu(edge.rectIn.y);
  const rcx = inchToEmu(edge.rectIn.w);
  const rcy = inchToEmu(edge.rectIn.h);

  const dx = rx - lineRectEmu.x;
  const dy = ry - lineRectEmu.y;
  const dw = rcx - lineRectEmu.cx;
  const dh = rcy - lineRectEmu.cy;
  return dx * dx + dy * dy + dw * dw + dh * dh;
}

export function findBestEdgeMeta(metaEdges: PptxEdgeMeta[] | undefined, lineRectEmu: PptxEmuRect): PptxEdgeMeta | null {
  if (!metaEdges || metaEdges.length === 0) return null;
  let best: PptxEdgeMeta | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const e of metaEdges) {
    const s = edgeMetaScore(e, lineRectEmu);
    if (s < bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}

