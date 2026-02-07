import { type PptxEmuRect, type PptxPostProcessMeta } from './pptxPostProcessMeta';
import { getPptxNs } from './xmlDom';
import { parseEdgeIdStyleMarker, parseEdgeMarker, parseNodeMarker } from './pptxMarkers';
import { resolveEdgeStyle } from './edgeStyle';
import { buildCxnSp } from './builders/connectorBuilder';
import {
  type ConnectorReplaceResult,
  getSpTree,
  getShapeId,
  getShapeMarker,
  getPrstGeomPrst,
  getXfrmRectEmu,
  getLineLn,
  getMaxShapeId,
  center,
  dist2,
  chooseConnIdx,
  findFirstNodeInsertionIndex,
  findEdgeMetaById,
  ensureDash,
  ensureEnd,
  findBestEdgeMeta,
} from './attachConnectorsShared';




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

    const x = Math.min(b.x, b.x + b.cx);
    const y = Math.min(b.y, b.y + b.cy);
    const cx = Math.abs(b.cx);
    const cy = Math.abs(b.cy);

    let ln: Element | null = null;
    if (ls.ln) {
      ln = ls.ln.cloneNode(true) as Element;

      const edgeMeta =
        findEdgeMetaById(meta?.edges, mkId?.edgeId) ?? findBestEdgeMeta(meta?.edges, b);
      const style = resolveEdgeStyle(edgeMeta ?? null, mkId ?? null);

      if (style.dash === 'dash') ensureDash(doc, ns.a, ln, 'dash');
      else if (style.dash === 'dot') ensureDash(doc, ns.a, ln, 'dot');

      ensureEnd(doc, ns.a, ln, 'headEnd', style.head);
      ensureEnd(doc, ns.a, ln, 'tailEnd', style.tail);
    }

    const cxnSp = buildCxnSp(doc, { p: ns.p, a: ns.a }, {
      shapeId: maxId,
      name: `Connector ${maxId}`,
      from: { id: from.id, idx: chooseConnIdx(center(from.rect), center(to.rect)) },
      to: { id: to.id, idx: chooseConnIdx(center(to.rect), center(from.rect)) },
      bbox: { x, y, cx, cy },
      ln,
    });

    if (insertBefore) spTree.insertBefore(cxnSp, insertBefore);
    else spTree.appendChild(cxnSp);

    spTree.removeChild(ls.sp);
    replaced += 1;
  }

  notes.push(`Found ${nodeShapes.length} nodes and ${lineShapes.length} lines.`);
  notes.push(`Replaced ${replaced} lines; skipped ${skipped}.`);
  return { xml: new XMLSerializer().serializeToString(doc), replacedCount: replaced, skippedCount: skipped, notes };
}
