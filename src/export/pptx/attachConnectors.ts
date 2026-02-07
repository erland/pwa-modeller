import { inchToEmu, PptxEmuRect, PptxEdgeMeta, PptxPostProcessMeta } from './pptxPostProcessMeta';
import {
  createEl,
  findAllByLocalName,
  findFirstByLocalName,
  getPptxNs,
  readNumAttr,
} from './xmlDom';

import {
  parseEdgeIdStyleMarker,
  parseEdgeMarker,
  parseNodeMarker,
} from './pptxMarkers';

import { buildNodeMap } from './nodeMap';

export type ConnectorReplaceResult = {
  xml: string;
  replacedCount: number;
  skippedCount: number;
  notes: string[];
};


function getSpTree(doc: Document): Element | null {
  const root = doc.documentElement;
  const cSld = findFirstByLocalName(root, 'cSld');
  if (!cSld) return null;
  return findFirstByLocalName(cSld, 'spTree');
}

function getShapeId(sp: Element): number | null {
  const cNvPr = findFirstByLocalName(sp, 'cNvPr');
  if (!cNvPr) return null;
  const id = Number(cNvPr.getAttribute('id') ?? '0');
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getShapeName(sp: Element): string {
  const cNvPr = findFirstByLocalName(sp, 'cNvPr');
  return (cNvPr?.getAttribute('name') ?? '').trim();
}

function getShapeDescr(sp: Element): string {
  const cNvPr = findFirstByLocalName(sp, 'cNvPr');
  return (cNvPr?.getAttribute('descr') ?? '').trim();
}

function getShapeMarker(sp: Element): string {
  const d = getShapeDescr(sp);
  if (d) return d;
  return getShapeName(sp);
}

function getPrstGeomPrst(sp: Element): string | null {
  const spPr = findFirstByLocalName(sp, 'spPr');
  if (!spPr) return null;
  const geom = findFirstByLocalName(spPr, 'prstGeom');
  if (!geom) return null;
  const prst = (geom.getAttribute('prst') ?? '').trim();
  return prst || null;
}

function getXfrmRectEmu(sp: Element): PptxEmuRect | null {
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

function getLineLn(sp: Element): Element | null {
  const spPr = findFirstByLocalName(sp, 'spPr');
  if (!spPr) return null;
  return findFirstByLocalName(spPr, 'ln');
}

function getMaxShapeId(doc: Document): number {
  let maxId = 0;
  const cNvPrs = findAllByLocalName(doc.documentElement, 'cNvPr');
  for (const c of cNvPrs) {
    const id = Number(c.getAttribute('id') ?? '0');
    if (Number.isFinite(id) && id > maxId) maxId = id;
  }
  return maxId;
}

function center(r: PptxEmuRect): { x: number; y: number } {
  return { x: r.x + r.cx / 2, y: r.y + r.cy / 2 };
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function chooseConnIdx(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

function readShapeRectEmu(el: Element, nsA: string): PptxEmuRect | null {
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

function cssColorToHex(color: string | undefined | null): string {
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



function ensureAvLst(doc: Document, nsA: string): Element {
  return createEl(doc, nsA, 'a:avLst');
}

function addCxnSpLocks(doc: Document, nsA: string, cNvCxnSpPr: Element): void {
  const locks = createEl(doc, nsA, 'a:cxnSpLocks');
  cNvCxnSpPr.appendChild(locks);
}

function findFirstNodeInsertionIndex(spTree: Element): number {
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

function findEdgeMetaById(metaEdges: PptxEdgeMeta[] | undefined, edgeId: string | undefined): PptxEdgeMeta | null {
  if (!metaEdges || !edgeId) return null;
  for (const e of metaEdges) {
    if (String(e.edgeId) === String(edgeId)) return e;
  }
  return null;
}

function ensureDash(doc: Document, nsA: string, ln: Element, val: 'dash' | 'dot' | 'solid'): void {
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

function ensureEnd(
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

function edgeMetaScore(edge: PptxEdgeMeta, lineRectEmu: PptxEmuRect): number {
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

function findBestEdgeMeta(metaEdges: PptxEdgeMeta[] | undefined, lineRectEmu: PptxEmuRect): PptxEdgeMeta | null {
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

export function replaceAllLineShapesWithConnectors(
  slideXml: string,
  meta?: PptxPostProcessMeta
): ConnectorReplaceResult {
  const notes: string[] = [];
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: ['XML parser not available.'] };
  }

  const doc = new DOMParser().parseFromString(slideXml, 'application/xml');
  const ns = getPptxNs(doc);
  const spTree = getSpTree(doc);
  if (!spTree) return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: ['spTree not found.'] };

  const children = Array.from(spTree.children) as Element[];

  const nodeShapes = children
    .filter((c) => c.localName === 'sp')
    .map((sp) => ({
      sp,
      prst: getPrstGeomPrst(sp),
      rect: getXfrmRectEmu(sp),
      id: getShapeId(sp),
    }))
    .filter((x) => !!x.id && !!x.rect && (x.prst === 'roundRect' || x.prst === 'rect')) as Array<{
    sp: Element;
    rect: PptxEmuRect;
    id: number;
  }>;

  const nodeIdToShape = new Map<string, { id: number; rect: PptxEmuRect }>();
  for (const n of nodeShapes) {
    const mk = parseNodeMarker(getShapeMarker(n.sp));
    if (mk) nodeIdToShape.set(mk, { id: n.id, rect: n.rect });
  }

  const lineShapes = children
    .filter((c) => c.localName === 'sp')
    .map((sp) => ({
      sp,
      prst: getPrstGeomPrst(sp),
      rect: getXfrmRectEmu(sp),
      ln: getLineLn(sp),
    }))
    .filter((x) => !!x.rect && x.prst === 'line') as Array<{
    sp: Element;
    rect: PptxEmuRect;
    ln: Element | null;
  }>;

  if (nodeShapes.length < 2 || lineShapes.length === 0) {
    notes.push(`Nodes=${nodeShapes.length}, Lines=${lineShapes.length}. Nothing to replace.`);
    return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes };
  }

  const insertIdx = findFirstNodeInsertionIndex(spTree);
  const insertBefore = spTree.children[insertIdx] ?? null;

  let maxId = getMaxShapeId(doc);
  let replaced = 0;
  let skipped = 0;

  for (const ls of lineShapes) {
    const b = ls.rect;
    const markerText = getShapeMarker(ls.sp);
    const mkId = parseEdgeIdStyleMarker(markerText);
    const mk = parseEdgeMarker(markerText.startsWith('EA_EDGEID:') ? `EA_EDGE:${markerText.split('|').slice(1).join('|')}` : markerText);

    let from: { id: number; rect: PptxEmuRect } | null = null;
    let to: { id: number; rect: PptxEmuRect } | null = null;

    if (mkId?.from && mkId?.to) {
  const f = nodeIdToShape.get(mkId.from);
  const t = nodeIdToShape.get(mkId.to);
  if (f && t && f.id !== t.id) {
    from = { id: f.id, rect: f.rect };
    to = { id: t.id, rect: t.rect };
  }
}

if (!from || !to) {
  if (mk?.from && mk?.to) {
    const f = nodeIdToShape.get(mk.from);
    const t = nodeIdToShape.get(mk.to);
    if (f && t && f.id !== t.id) {
      from = { id: f.id, rect: f.rect };
      to = { id: t.id, rect: t.rect };
    }
  }
}

    if (!from || !to) {
      const p1 = { x: b.x, y: b.y };
      const p2 = { x: b.x + b.cx, y: b.y + b.cy };

      let bestA: { id: number; rect: PptxEmuRect; d: number } | null = null;
      let bestB: { id: number; rect: PptxEmuRect; d: number } | null = null;

      for (const n of nodeShapes) {
        const c = center(n.rect);
        const d1 = dist2(p1.x, p1.y, c.x, c.y);
        const d2 = dist2(p2.x, p2.y, c.x, c.y);
        if (!bestA || d1 < bestA.d) bestA = { id: n.id, rect: n.rect, d: d1 };
        if (!bestB || d2 < bestB.d) bestB = { id: n.id, rect: n.rect, d: d2 };
      }

      if (!bestA || !bestB || bestA.id === bestB.id) {
        skipped += 1;
        continue;
      }

      from = { id: bestA.id, rect: bestA.rect };
      to = { id: bestB.id, rect: bestB.rect };
    }

    maxId += 1;

    const cxnSp = createEl(doc, ns.p, 'p:cxnSp');

    const nv = createEl(doc, ns.p, 'p:nvCxnSpPr');
    const cNvPr = createEl(doc, ns.p, 'p:cNvPr');
    cNvPr.setAttribute('id', String(maxId));
    cNvPr.setAttribute('name', `Connector ${maxId}`);

    const cNvCxnSpPr = createEl(doc, ns.p, 'p:cNvCxnSpPr');
    addCxnSpLocks(doc, ns.a, cNvCxnSpPr);

    const st = createEl(doc, ns.a, 'a:stCxn');
    st.setAttribute('id', String(from.id));
    st.setAttribute('idx', String(chooseConnIdx(center(from.rect), center(to.rect))));

    const en = createEl(doc, ns.a, 'a:endCxn');
    en.setAttribute('id', String(to.id));
    en.setAttribute('idx', String(chooseConnIdx(center(to.rect), center(from.rect))));

    cNvCxnSpPr.appendChild(st);
    cNvCxnSpPr.appendChild(en);

    const nvPr = createEl(doc, ns.p, 'p:nvPr');

    nv.appendChild(cNvPr);
    nv.appendChild(cNvCxnSpPr);
    nv.appendChild(nvPr);

    const spPr = createEl(doc, ns.p, 'p:spPr');

    const x = Math.min(b.x, b.x + b.cx);
    const y = Math.min(b.y, b.y + b.cy);
    const cx = Math.abs(b.cx);
    const cy = Math.abs(b.cy);

    const xfrm = createEl(doc, ns.a, 'a:xfrm');
    const off = createEl(doc, ns.a, 'a:off');
    off.setAttribute('x', String(x));
    off.setAttribute('y', String(y));
    const ext = createEl(doc, ns.a, 'a:ext');
    ext.setAttribute('cx', String(cx));
    ext.setAttribute('cy', String(cy));
    xfrm.appendChild(off);
    xfrm.appendChild(ext);

    const geom = createEl(doc, ns.a, 'a:prstGeom');
    geom.setAttribute('prst', 'line');
    geom.appendChild(ensureAvLst(doc, ns.a));

    spPr.appendChild(xfrm);
    spPr.appendChild(geom);

    if (ls.ln) {
      const ln = ls.ln.cloneNode(true) as Element;

      const edgeMeta =
  findEdgeMetaById(meta?.edges, mkId?.edgeId) ?? findBestEdgeMeta(meta?.edges, b);

const patVal = (edgeMeta?.linePattern ??
  mkId?.pattern ??
  (edgeMeta?.dashed ? 'dashed' : 'solid')) as 'solid' | 'dashed' | 'dotted';

if (patVal === 'dashed') ensureDash(doc, ns.a, ln, 'dash');
else if (patVal === 'dotted') ensureDash(doc, ns.a, ln, 'dot');

const head = (edgeMeta?.pptxHeadEnd ?? mkId?.head ?? 'none') as 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
const tail = (edgeMeta?.pptxTailEnd ?? mkId?.tail ?? 'none') as 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';

ensureEnd(doc, ns.a, ln, 'headEnd', head);
ensureEnd(doc, ns.a, ln, 'tailEnd', tail);

spPr.appendChild(ln);
    }

    cxnSp.appendChild(nv);
    cxnSp.appendChild(spPr);

    if (insertBefore) spTree.insertBefore(cxnSp, insertBefore);
    else spTree.appendChild(cxnSp);

    spTree.removeChild(ls.sp);
    replaced += 1;
  }

  notes.push(`Found ${nodeShapes.length} nodes and ${lineShapes.length} lines.`);
  notes.push(`Replaced ${replaced} lines; skipped ${skipped}.`);
  return { xml: new XMLSerializer().serializeToString(doc), replacedCount: replaced, skippedCount: skipped, notes };
}

export function rebuildConnectorsFromMeta(slideXml: string, meta?: PptxPostProcessMeta): ConnectorReplaceResult {
  try {
    const notes: string[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(slideXml, 'application/xml');

    const ns = {
      p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
      a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
      r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    };

    // Locate spTree
    const spTree = doc.getElementsByTagNameNS(ns.p, 'spTree')[0];
    if (!spTree) {
      return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: ['No p:spTree found.'] };
    }

    const children = Array.from(spTree.childNodes).filter((n) => n.nodeType === 1) as Element[];

    // Build node map (markers first, then geometry fallback)
    const { map: nodeIdToShape, notes: nodeMapNotes } = buildNodeMap({
      children,
      nsP: ns.p,
      nsA: ns.a,
      meta,
      getShapeMarker,
      readShapeRectEmu,
    });
    notes.push(...nodeMapNotes);

// Remove existing connectors and any placeholder line shapes (p:sp with prstGeom line) to avoid duplicates
    let removed = 0;
    for (const el of children) {
      if (el.localName === 'cxnSp') {
        spTree.removeChild(el);
        removed++;
      } else if (el.localName === 'sp') {
        const prst = el.getElementsByTagNameNS(ns.a, 'prstGeom')[0]?.getAttribute('prst');
        if (prst === 'line') {
          spTree.removeChild(el);
          removed++;
        }
      }
    }

    const edges = meta?.edges ?? [];
    let replaced = 0;
    let skipped = 0;

    // Helper: emu -> string
    const emu = (v: number) => String(Math.round(v));

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const fromId = e.fromNodeId;
      const toId = e.toNodeId;
      if (!fromId || !toId) {
        skipped++;
        continue;
      }
      const from = nodeIdToShape.get(fromId);
      const to = nodeIdToShape.get(toId);
      if (!from || !to || from.id === to.id) {
        skipped++;
        continue;
      }

      // Compute connector bbox from node centers
      const aC = center(from.rect);
      const bC = center(to.rect);
      const x = Math.min(aC.x, bC.x);
      const y = Math.min(aC.y, bC.y);
      const minExt = 10000; // ~0.011" in EMU, prevents invisible connectors when nearly horizontal/vertical
      const cx = Math.max(minExt, Math.abs(aC.x - bC.x));
      const cy = Math.max(minExt, Math.abs(aC.y - bC.y));

      // Determine connection indices (0..3) on each shape
      // Connector index selection was used in early prototypes; current PPTX connector routing uses absolute geometry.
      // Style
      const pat = String(e.linePattern ?? (e.dashed ? 'dashed' : 'solid'));
      let head = String(e.pptxHeadEnd ?? 'none');
      let tail = String(e.pptxTailEnd ?? 'none');
      const rt = String(e.relType ?? '').toLowerCase();
      if (rt.includes('composition') || rt.includes('aggregation')) {
        head = 'diamond';
        tail = 'none';
      }

      const strokeHex = cssColorToHex(e.strokeHex);
      const widthPt = typeof e.strokeWidthPt === 'number' ? e.strokeWidthPt : 1;
      const widthEmu = Math.max(12700, Math.round(widthPt * 12700)); // 1pt ~= 12700 EMU in DrawingML

      const cxnSp = createEl(doc, ns.p, 'p:cxnSp');

      // nvCxnSpPr
      const nv = createEl(doc, ns.p, 'p:nvCxnSpPr');
      const cNvPr = createEl(doc, ns.p, 'p:cNvPr');
      cNvPr.setAttribute('id', String(8000 + i));
      cNvPr.setAttribute('name', `EA_CXN:${e.edgeId ?? i}`);
      const cNvCxnSpPr = createEl(doc, ns.p, 'p:cNvCxnSpPr');
      const nvPr = createEl(doc, ns.p, 'p:nvPr');
      nv.appendChild(cNvPr);
      nv.appendChild(cNvCxnSpPr);
      nv.appendChild(nvPr);

      // spPr with xfrm and a:prstGeom
      const spPr = createEl(doc, ns.p, 'p:spPr');
      const xfrm = createEl(doc, ns.a, 'a:xfrm');
      const off = createEl(doc, ns.a, 'a:off'); off.setAttribute('x', emu(x)); off.setAttribute('y', emu(y));
      const ext = createEl(doc, ns.a, 'a:ext'); ext.setAttribute('cx', emu(cx)); ext.setAttribute('cy', emu(cy));
      xfrm.appendChild(off); xfrm.appendChild(ext);
      spPr.appendChild(xfrm);

      const prstGeom = createEl(doc, ns.a, 'a:prstGeom'); prstGeom.setAttribute('prst','straightConnector1');
      const avLst = createEl(doc, ns.a, 'a:avLst');
      prstGeom.appendChild(avLst);
      spPr.appendChild(prstGeom);

      // a:ln
      const ln = createEl(doc, ns.a, 'a:ln');
      ln.setAttribute('w', String(widthEmu));

      const solidFill = createEl(doc, ns.a, 'a:solidFill');
      const srgb = createEl(doc, ns.a, 'a:srgbClr'); srgb.setAttribute('val', strokeHex);
      solidFill.appendChild(srgb);
      ln.appendChild(solidFill);

      if (pat === 'dashed') {
        const prstDash = createEl(doc, ns.a, 'a:prstDash'); prstDash.setAttribute('val','dash');
        ln.appendChild(prstDash);
      } else if (pat === 'dotted') {
        const prstDash = createEl(doc, ns.a, 'a:prstDash'); prstDash.setAttribute('val','dot');
        ln.appendChild(prstDash);
      }

      if (head && head !== 'none') {
        const he = createEl(doc, ns.a, 'a:headEnd'); he.setAttribute('type', head);
        if (head === 'diamond') { he.setAttribute('w','med'); he.setAttribute('len','med'); }
        ln.appendChild(he);
      }
      if (tail && tail !== 'none') {
        const te = createEl(doc, ns.a, 'a:tailEnd'); te.setAttribute('type', tail);
        if (tail === 'diamond') { te.setAttribute('w','med'); te.setAttribute('len','med'); }
        ln.appendChild(te);
      }

      spPr.appendChild(ln);

      // stCxn / endCxn

      cxnSp.appendChild(nv);
      cxnSp.appendChild(spPr);
      
      spTree.appendChild(cxnSp);
      replaced++;
    }

    notes.push(`Node map: ${nodeIdToShape.size} nodes.`);
    notes.push(`Removed ${removed} existing connector/line shapes.`);
    notes.push(`Built ${replaced} connectors; skipped ${skipped}.`);

    return { xml: new XMLSerializer().serializeToString(doc), replacedCount: replaced, skippedCount: skipped, notes };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: [`rebuildConnectorsFromMeta failed: ${msg}`] };
  }
}

function normalizeHex6(v: string | undefined | null, fallback: string): string {
  if (!v) return fallback;
  const s = String(v).trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return m[1].toUpperCase();
  const m3 = s.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    const h = m3[1];
    return (h[0]+h[0]+h[1]+h[1]+h[2]+h[2]).toUpperCase();
  }
  return fallback;
}

function createNodeShapeFromMeta(
  doc: Document,
  ns: { p: string; a: string },
  shapeId: number,
  rectEmu: PptxEmuRect,
  nameLine: string,
  typeLine?: string,
  fillHex?: string,
  strokeHex?: string,
  textHex?: string
): Element {
  const sp = createEl(doc, ns.p, 'p:sp');

  const nvSpPr = createEl(doc, ns.p, 'p:nvSpPr');
  const cNvPr = createEl(doc, ns.p, 'p:cNvPr');
  cNvPr.setAttribute('id', String(shapeId));
  cNvPr.setAttribute('name', `EA_NODE:${shapeId}`);
  const cNvSpPr = createEl(doc, ns.p, 'p:cNvSpPr');
  const nvPr = createEl(doc, ns.p, 'p:nvPr');
  nvSpPr.appendChild(cNvPr);
  nvSpPr.appendChild(cNvSpPr);
  nvSpPr.appendChild(nvPr);

  const spPr = createEl(doc, ns.p, 'p:spPr');
  const xfrm = createEl(doc, ns.a, 'a:xfrm');
  const off = createEl(doc, ns.a, 'a:off'); off.setAttribute('x', String(Math.round(rectEmu.x))); off.setAttribute('y', String(Math.round(rectEmu.y)));
  const ext = createEl(doc, ns.a, 'a:ext'); ext.setAttribute('cx', String(Math.round(rectEmu.cx))); ext.setAttribute('cy', String(Math.round(rectEmu.cy)));
  xfrm.appendChild(off); xfrm.appendChild(ext);
  spPr.appendChild(xfrm);

  const prstGeom = createEl(doc, ns.a, 'a:prstGeom'); prstGeom.setAttribute('prst', 'roundRect');
  prstGeom.appendChild(createEl(doc, ns.a, 'a:avLst'));
  spPr.appendChild(prstGeom);

  const fill = createEl(doc, ns.a, 'a:solidFill');
  const fillClr = createEl(doc, ns.a, 'a:srgbClr');
  fillClr.setAttribute('val', normalizeHex6(fillHex, '9FCFFF'));
  fill.appendChild(fillClr);
  spPr.appendChild(fill);

  const ln = createEl(doc, ns.a, 'a:ln');
  ln.setAttribute('w', '6350'); // matches pptxgen default from working file
  const lnFill = createEl(doc, ns.a, 'a:solidFill');
  const lnClr = createEl(doc, ns.a, 'a:srgbClr');
  lnClr.setAttribute('val', normalizeHex6(strokeHex, '111111'));
  lnFill.appendChild(lnClr);
  ln.appendChild(lnFill);
  spPr.appendChild(ln);

  const txBody = createEl(doc, ns.p, 'p:txBody');
  const bodyPr = createEl(doc, ns.a, 'a:bodyPr');
  bodyPr.setAttribute('wrap', 'square');
  bodyPr.setAttribute('lIns', '50800');
  bodyPr.setAttribute('tIns', '50800');
  bodyPr.setAttribute('rIns', '50800');
  bodyPr.setAttribute('bIns', '50800');
  bodyPr.setAttribute('rtlCol', '0');
  bodyPr.setAttribute('anchor', 'ctr');
  txBody.appendChild(bodyPr);
  txBody.appendChild(createEl(doc, ns.a, 'a:lstStyle'));

  const p = createEl(doc, ns.a, 'a:p');

  // line 1 (bold, 14pt)
  const pPr1 = createEl(doc, ns.a, 'a:pPr');
  pPr1.setAttribute('algn', 'ctr');
  pPr1.setAttribute('indent', '0');
  pPr1.setAttribute('marL', '0');
  pPr1.appendChild(createEl(doc, ns.a, 'a:buNone'));
  p.appendChild(pPr1);

  const r1 = createEl(doc, ns.a, 'a:r');
  const rPr1 = createEl(doc, ns.a, 'a:rPr');
  rPr1.setAttribute('lang', 'en-US');
  rPr1.setAttribute('sz', '1400');
  rPr1.setAttribute('b', '1');
  rPr1.setAttribute('dirty', '0');
  const rFill1 = createEl(doc, ns.a, 'a:solidFill');
  const rClr1 = createEl(doc, ns.a, 'a:srgbClr');
  rClr1.setAttribute('val', normalizeHex6(textHex, '111111'));
  rFill1.appendChild(rClr1);
  rPr1.appendChild(rFill1);
  const latin1 = createEl(doc, ns.a, 'a:latin'); latin1.setAttribute('typeface', 'Calibri'); latin1.setAttribute('pitchFamily', '34'); latin1.setAttribute('charset', '0');
  rPr1.appendChild(latin1);
  r1.appendChild(rPr1);
  const t1 = createEl(doc, ns.a, 'a:t');
  t1.textContent = (nameLine ?? '').trim() + (typeLine ? '\n' : '');
  r1.appendChild(t1);
  p.appendChild(r1);

  // line 2 (italic, 10pt)
  if (typeLine) {
    const pPr2 = createEl(doc, ns.a, 'a:pPr');
    pPr2.setAttribute('algn', 'ctr');
    pPr2.setAttribute('indent', '0');
    pPr2.setAttribute('marL', '0');
    pPr2.appendChild(createEl(doc, ns.a, 'a:buNone'));
    p.appendChild(pPr2);

    const r2 = createEl(doc, ns.a, 'a:r');
    const rPr2 = createEl(doc, ns.a, 'a:rPr');
    rPr2.setAttribute('lang', 'en-US');
    rPr2.setAttribute('sz', '1000');
    rPr2.setAttribute('i', '1');
    rPr2.setAttribute('dirty', '0');
    const rFill2 = createEl(doc, ns.a, 'a:solidFill');
    const rClr2 = createEl(doc, ns.a, 'a:srgbClr');
    rClr2.setAttribute('val', normalizeHex6(textHex, '111111'));
    rFill2.appendChild(rClr2);
    rPr2.appendChild(rFill2);
    const latin2 = createEl(doc, ns.a, 'a:latin'); latin2.setAttribute('typeface', 'Calibri'); latin2.setAttribute('pitchFamily', '34'); latin2.setAttribute('charset', '0');
    rPr2.appendChild(latin2);
    r2.appendChild(rPr2);
    const t2 = createEl(doc, ns.a, 'a:t');
    t2.textContent = typeLine;
    r2.appendChild(t2);
    p.appendChild(r2);
  }

  const endPara = createEl(doc, ns.a, 'a:endParaRPr');
  endPara.setAttribute('lang', 'en-US');
  endPara.setAttribute('sz', '1000');
  endPara.setAttribute('dirty', '0');
  p.appendChild(endPara);

  txBody.appendChild(p);

  sp.appendChild(nvSpPr);
  sp.appendChild(spPr);
  sp.appendChild(txBody);
  return sp;
}

export function rebuildSlideFromMeta(slideXml: string, meta?: PptxPostProcessMeta): ConnectorReplaceResult {
  try {
    const notes: string[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(slideXml, 'application/xml');

    const ns = {
      p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
      a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    };

    const spTree = doc.getElementsByTagNameNS(ns.p, 'spTree')[0];
    if (!spTree) return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: ['No p:spTree found.'] };

    const all = Array.from(spTree.childNodes).filter((n) => n.nodeType === 1) as Element[];

    // Keep only the mandatory group props
    for (const el of all) {
      const ln = el.localName;
      if (ln === 'nvGrpSpPr' || ln === 'grpSpPr') continue;
      spTree.removeChild(el);
    }

    const nodes = meta?.nodes ?? [];
    const edges = meta?.edges ?? [];
    notes.push(`Meta: ${nodes.length} nodes, ${edges.length} edges.`);

    // Allocate deterministic shape ids
    let nextId = 4;
    const nodeShapeIdByElementId = new Map<string, number>();
    const nodeRectEmuByElementId = new Map<string, PptxEmuRect>();

    for (const n of nodes) {
      const id = nextId++;
      nodeShapeIdByElementId.set(String(n.elementId), id);

      const r = n.rectIn;
      const rectEmu: PptxEmuRect = { x: inchToEmu(r.x), y: inchToEmu(r.y), cx: inchToEmu(r.w), cy: inchToEmu(r.h) };
      nodeRectEmuByElementId.set(String(n.elementId), rectEmu);

      const sp = createNodeShapeFromMeta(
        doc,
        { p: ns.p, a: ns.a },
        id,
        rectEmu,
        n.name,
        n.typeLabel,
        n.fillHex,
        n.strokeHex,
        n.textHex
      );

      // Tag element id in marker so future steps can recover
      const cNvPr = sp.getElementsByTagNameNS(ns.p, 'cNvPr')[0];
      if (cNvPr) cNvPr.setAttribute('descr', `EA_NODEID:${String(n.elementId)}`);

      spTree.appendChild(sp);
    }

    // Build connectors after nodes, but insert before first node so they appear behind.
    const firstNodeEl = Array.from(spTree.childNodes).find(
      (n): n is Element => n.nodeType === 1 && (n as Element).localName === 'sp'
    );
    let replaced = 0;
    let skipped = 0;

    const chooseIdx = (from: PptxEmuRect, to: PptxEmuRect) => chooseConnIdx(center(from), center(to));

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const fromEl = e.fromNodeId;
      const toEl = e.toNodeId;
      if (!fromEl || !toEl) { skipped++; continue; }

      const fromId = nodeShapeIdByElementId.get(String(fromEl));
      const toId = nodeShapeIdByElementId.get(String(toEl));
      const fromRect = nodeRectEmuByElementId.get(String(fromEl));
      const toRect = nodeRectEmuByElementId.get(String(toEl));
      if (!fromId || !toId || !fromRect || !toRect || fromId === toId) { skipped++; continue; }

      const aC = center(fromRect);
      const bC = center(toRect);
      const x = Math.min(aC.x, bC.x);
      const y = Math.min(aC.y, bC.y);
      const minExt = 10000;
      const cx = Math.max(minExt, Math.abs(aC.x - bC.x));
      const cy = Math.max(minExt, Math.abs(aC.y - bC.y));

      const stIdx = chooseIdx(fromRect, toRect);
      const enIdx = chooseIdx(toRect, fromRect);

      const pat = String(e.linePattern ?? (e.dashed ? 'dashed' : 'solid'));
      const head = String(e.pptxHeadEnd ?? 'none');
      const tail = String(e.pptxTailEnd ?? 'none');

      const strokeHex = normalizeHex6(e.strokeHex, '111111');
      const widthPt = typeof e.strokeWidthPt === 'number' ? e.strokeWidthPt : 1;
      const widthEmu = Math.max(12700, Math.round(widthPt * 12700));

      const cxnSp = createEl(doc, ns.p, 'p:cxnSp');

      const nv = createEl(doc, ns.p, 'p:nvCxnSpPr');
      const cNvPr = createEl(doc, ns.p, 'p:cNvPr');
      cNvPr.setAttribute('id', String(8000 + i));
      cNvPr.setAttribute('name', `EA_CXN:${String(e.edgeId ?? i)}`);
      const cNvCxnSpPr = createEl(doc, ns.p, 'p:cNvCxnSpPr');
      // Lock aspect/position per PowerPoint expectations
      const locks = createEl(doc, ns.a, 'a:cxnSpLocks');
      locks.setAttribute('noGrp', '1');
      cNvCxnSpPr.appendChild(locks);

      const stCxn = createEl(doc, ns.a, 'a:stCxn');
      stCxn.setAttribute('id', String(fromId));
      stCxn.setAttribute('idx', String(stIdx));
      const endCxn = createEl(doc, ns.a, 'a:endCxn');
      endCxn.setAttribute('id', String(toId));
      endCxn.setAttribute('idx', String(enIdx));
      cNvCxnSpPr.appendChild(stCxn);
      cNvCxnSpPr.appendChild(endCxn);

      const nvPr = createEl(doc, ns.p, 'p:nvPr');
      nv.appendChild(cNvPr); nv.appendChild(cNvCxnSpPr); nv.appendChild(nvPr);

      const spPr = createEl(doc, ns.p, 'p:spPr');
      const xfrm = createEl(doc, ns.a, 'a:xfrm');
      const off = createEl(doc, ns.a, 'a:off'); off.setAttribute('x', String(Math.round(x))); off.setAttribute('y', String(Math.round(y)));
      const ext = createEl(doc, ns.a, 'a:ext'); ext.setAttribute('cx', String(Math.round(cx))); ext.setAttribute('cy', String(Math.round(cy)));
      xfrm.appendChild(off); xfrm.appendChild(ext);
      spPr.appendChild(xfrm);

      const prstGeom = createEl(doc, ns.a, 'a:prstGeom'); prstGeom.setAttribute('prst','straightConnector1');
      prstGeom.appendChild(createEl(doc, ns.a, 'a:avLst'));
      spPr.appendChild(prstGeom);

      const ln = createEl(doc, ns.a, 'a:ln');
      ln.setAttribute('w', String(widthEmu));
      const solidFill = createEl(doc, ns.a, 'a:solidFill');
      const clr = createEl(doc, ns.a, 'a:srgbClr'); clr.setAttribute('val', strokeHex);
      solidFill.appendChild(clr);
      ln.appendChild(solidFill);
      if (pat === 'dashed') { const d = createEl(doc, ns.a, 'a:prstDash'); d.setAttribute('val','dash'); ln.appendChild(d); }
      else if (pat === 'dotted') { const d = createEl(doc, ns.a, 'a:prstDash'); d.setAttribute('val','dot'); ln.appendChild(d); }

      if (head && head !== 'none') { const he = createEl(doc, ns.a, 'a:headEnd'); he.setAttribute('type', head); if (head==='diamond'){he.setAttribute('w','med'); he.setAttribute('len','med');} ln.appendChild(he); }
      if (tail && tail !== 'none') { const te = createEl(doc, ns.a, 'a:tailEnd'); te.setAttribute('type', tail); if (tail==='diamond'){te.setAttribute('w','med'); te.setAttribute('len','med');} ln.appendChild(te); }

      spPr.appendChild(ln);

      const st = createEl(doc, ns.p, 'p:stCxn');
      st.setAttribute('id', String(fromId));
      st.setAttribute('idx', String(stIdx));
      const en = createEl(doc, ns.p, 'p:endCxn');
      en.setAttribute('id', String(toId));
      en.setAttribute('idx', String(enIdx));

      cxnSp.appendChild(nv);
      cxnSp.appendChild(spPr);
      
      if (firstNodeEl) spTree.insertBefore(cxnSp, firstNodeEl);
      else spTree.appendChild(cxnSp);
      replaced++;
    }

    notes.push(`Built ${replaced} connectors; skipped ${skipped}.`);

    return { xml: new XMLSerializer().serializeToString(doc), replacedCount: replaced, skippedCount: skipped, notes };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { xml: slideXml, replacedCount: 0, skippedCount: 0, notes: [`rebuildSlideFromMeta failed: ${msg}`] };
  }
}
