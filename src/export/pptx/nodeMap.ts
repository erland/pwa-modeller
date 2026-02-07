import { inchToEmu, PptxEmuRect, PptxPostProcessMeta } from './pptxPostProcessMeta';
import { readNumAttr } from './xmlDom';
import { parseNodeMarker } from './pptxMarkers';

export type NodeShapeInfo = { id: number; rect: PptxEmuRect };

export type BuildNodeMapResult = {
  map: Map<string, NodeShapeInfo>;
  notes: string[];
};

/**
 * Build a nodeId -> (shapeId, rect) map from EA_NODE markers embedded in slide shapes.
 *
 * This is the preferred strategy because it is deterministic and does not rely on geometry heuristics.
 */
export function buildNodeMapFromMarkers(args: {
  children: Element[];
  nsP: string;
  nsA: string;
  getShapeMarker: (el: Element) => string;
  readShapeRectEmu: (el: Element, nsA: string) => PptxEmuRect | null;
}): Map<string, NodeShapeInfo> {
  const { children, nsP, nsA, getShapeMarker, readShapeRectEmu } = args;

  const nodeIdToShape = new Map<string, NodeShapeInfo>();

  for (const el of children) {
    if (el.localName !== 'sp') continue;

    const mk = getShapeMarker(el);
    const nodeId = parseNodeMarker(mk);
    if (!nodeId) continue;

    // node shapes are p:sp elements; shape id lives on p:cNvPr @id
    const cNvPr = el.getElementsByTagNameNS(nsP, 'cNvPr')[0];
    const shapeId = readNumAttr(cNvPr, 'id');
    const rect = readShapeRectEmu(el, nsA);
    if (!Number.isFinite(shapeId) || !rect) continue;

    nodeIdToShape.set(nodeId, { id: shapeId!, rect });
  }

  return nodeIdToShape;
}

/**
 * Fallback: build node map by matching meta.node rects to slide shapes by geometry.
 * This is useful when pptxgenjs does not preserve custom markers in the slide XML.
 */
export function buildNodeMapByGeometry(args: {
  children: Element[];
  nsP: string;
  nsA: string;
  meta: Pick<PptxPostProcessMeta, 'nodes'> | null | undefined;
  readShapeRectEmu: (el: Element, nsA: string) => PptxEmuRect | null;
}): BuildNodeMapResult {
  const { children, nsP, nsA, meta, readShapeRectEmu } = args;
  const notes: string[] = [];
  const map = new Map<string, NodeShapeInfo>();

  if (!meta?.nodes?.length) return { map, notes };

  const candidates: NodeShapeInfo[] = [];
  for (const el of children) {
    if (el.localName !== 'sp') continue;

    const cNvPr = el.getElementsByTagNameNS(nsP, 'cNvPr')[0];
    const shapeId = readNumAttr(cNvPr, 'id');
    const rect = readShapeRectEmu(el, nsA);
    if (!Number.isFinite(shapeId) || !rect) continue;

    const prst = el.getElementsByTagNameNS(nsA, 'prstGeom')[0]?.getAttribute('prst') ?? '';
    // Exclude line placeholders; focus on node shapes.
    if (prst === 'line') continue;

    candidates.push({ id: shapeId!, rect });
  }

  const used = new Set<number>();
  const score = (a: PptxEmuRect, b: PptxEmuRect): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);

  for (const n of meta.nodes) {
    const target: PptxEmuRect = {
      x: inchToEmu(n.rectIn.x),
      y: inchToEmu(n.rectIn.y),
      cx: inchToEmu(n.rectIn.w),
      cy: inchToEmu(n.rectIn.h),
    };

    let best: NodeShapeInfo | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const s = score(c.rect, target);
      if (s < bestScore) {
        bestScore = s;
        best = c;
      }
    }

    if (best) {
      used.add(best.id);
      map.set(n.elementId, best);
    }
  }

  notes.push(`Fallback node map via geometry: matched ${map.size}/${meta.nodes.length} nodes`);
  return { map, notes };
}

/**
 * Build a node map using markers when present; otherwise fall back to geometry matching.
 */
export function buildNodeMap(args: {
  children: Element[];
  nsP: string;
  nsA: string;
  meta: Pick<PptxPostProcessMeta, 'nodes'> | null | undefined;
  getShapeMarker: (el: Element) => string;
  readShapeRectEmu: (el: Element, nsA: string) => PptxEmuRect | null;
}): BuildNodeMapResult {
  const { children, nsP, nsA, meta, getShapeMarker, readShapeRectEmu } = args;
  const notes: string[] = [];

  const fromMarkers = buildNodeMapFromMarkers({ children, nsP, nsA, getShapeMarker, readShapeRectEmu });
  if (fromMarkers.size > 0) return { map: fromMarkers, notes };

  const byGeo = buildNodeMapByGeometry({ children, nsP, nsA, meta, readShapeRectEmu });
  return byGeo;
}
