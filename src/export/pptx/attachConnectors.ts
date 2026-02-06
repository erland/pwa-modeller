import { inchToEmu, PptxEmuRect, PptxEdgeMeta, PptxPostProcessMeta } from './pptxPostProcessMeta';

export type ConnectorReplaceResult = {
  xml: string;
  replacedCount: number;
  skippedCount: number;
  notes: string[];
};

type Ns = { p: string; a: string };

function getNs(doc: Document): Ns {
  const root = doc.documentElement;
  const p =
    root.lookupNamespaceURI('p') ??
    root.namespaceURI ??
    'http://schemas.openxmlformats.org/presentationml/2006/main';
  const a = root.lookupNamespaceURI('a') ?? 'http://schemas.openxmlformats.org/drawingml/2006/main';
  return { p, a };
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

function readNumAttr(el: Element | null, name: string): number | null {
  if (!el) return null;
  const v = el.getAttribute(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

function createEl(doc: Document, ns: string, qname: string): Element {
  return doc.createElementNS(ns, qname);
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

function parseNodeMarker(marker: string): string | null {
  if (!marker.startsWith('EA_NODE:')) return null;
  const v = marker.slice('EA_NODE:'.length).trim();
  return v ? v : null;
}

function parseEdgeMarker(marker: string): { from: string; to: string; relType?: string } | null {
  if (!marker.startsWith('EA_EDGE:')) return null;
  const v = marker.slice('EA_EDGE:'.length).trim();
  const parts = v.split('|');
  const core = (parts[0] ?? '').trim();
  const relType = (parts[1] ?? '').trim() || undefined;
  const mm = core.match(/^([^\s]+)->([^\s]+)$/);
  if (!mm) return null;
  return { from: mm[1], to: mm[2], relType };
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
  const ns = getNs(doc);
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
    const mk = parseEdgeMarker(getShapeMarker(ls.sp));

    let from: { id: number; rect: PptxEmuRect } | null = null;
    let to: { id: number; rect: PptxEmuRect } | null = null;

    if (mk) {
      const f = nodeIdToShape.get(mk.from);
      const t = nodeIdToShape.get(mk.to);
      if (f && t && f.id !== t.id) {
        from = { id: f.id, rect: f.rect };
        to = { id: t.id, rect: t.rect };
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

      const edgeMeta = findBestEdgeMeta(meta?.edges, b);
      const isDashed =
        !!edgeMeta?.dashed ||
        ((edgeMeta?.relType ?? mk?.relType ?? '').toLowerCase().includes('flow'));

      if (isDashed) ensureDash(doc, ns.a, ln, 'dash');

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
