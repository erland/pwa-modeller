import type { Point } from '../geometry';

export type Side = 'L' | 'R' | 'T' | 'B';

export function sideOf(rect: { x: number; y: number; w: number; h: number }, p: Point): Side {
  const dl = Math.abs(p.x - rect.x);
  const dr = Math.abs(p.x - (rect.x + rect.w));
  const dt = Math.abs(p.y - rect.y);
  const db = Math.abs(p.y - (rect.y + rect.h));
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return 'L';
  if (m === dr) return 'R';
  if (m === dt) return 'T';
  return 'B';
}

function pointInRect(p: Point, r: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function segIntersectsSeg(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSeg = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

export function segmentIntersectsRect(
  a: Point,
  b: Point,
  rect: { x: number; y: number; w: number; h: number },
  padding: number
): boolean {
  const r = { x: rect.x - padding, y: rect.y - padding, w: rect.w + padding * 2, h: rect.h + padding * 2 };
  if (pointInRect(a, r) || pointInRect(b, r)) return true;

  const tl: Point = { x: r.x, y: r.y };
  const tr: Point = { x: r.x + r.w, y: r.y };
  const br: Point = { x: r.x + r.w, y: r.y + r.h };
  const bl: Point = { x: r.x, y: r.y + r.h };

  const minx = Math.min(a.x, b.x);
  const maxx = Math.max(a.x, b.x);
  const miny = Math.min(a.y, b.y);
  const maxy = Math.max(a.y, b.y);
  if (maxx < r.x || minx > r.x + r.w || maxy < r.y || miny > r.y + r.h) return false;

  return (
    segIntersectsSeg(a, b, tl, tr) ||
    segIntersectsSeg(a, b, tr, br) ||
    segIntersectsSeg(a, b, br, bl) ||
    segIntersectsSeg(a, b, bl, tl)
  );
}

export function estimateTextBBox(center: Point, text: string): { x: number; y: number; w: number; h: number } {
  const w = Math.max(10, text.length * 7);
  const h = 14;
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

export function rectIntersectsRect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/**
 * UML multiplicity label placement used by DiagramRelationshipsLayer.
 * Extracted as-is to keep rendering file smaller.
 */
export function placeMultiplicityLabel(args: {
  points: Point[];
  which: 'source' | 'target';
  text: string;
  avoidSegments: Array<{ a: Point; b: Point }>;
  nodeRect: { x: number; y: number; w: number; h: number };
  hasDiamondMarker: boolean;
  baseExtraPerpOffset: number;
  // Kept for call-site compatibility; ignored by this placement strategy.
  preferredSign: 1 | -1;
  /** Number of multiplicity-bearing relationship-ends that share the same (node, side) group. */
  crowdCount?: number;
}): { x: number; y: number; dy: number } | null {
  const { points, which, text, avoidSegments, nodeRect, hasDiamondMarker } = args;
  const crowdCount = args.crowdCount ?? 1;
  if (points.length < 2) return null;

  const endPt = which === 'source' ? points[0] : points[points.length - 1];

  // Determine which side of the node we are attached to.
  // IMPORTANT: Do NOT rely on the first routed segment direction (nextPt-endPt)
  // since orthogonal routing may first travel sideways along the node border.
  // We want a stable anchor that is guaranteed to be OUTSIDE the node.
  const side = sideOf(nodeRect, endPt);
  const outward: Point =
    side === 'T'
      ? { x: 0, y: -1 }
      : side === 'B'
        ? { x: 0, y: 1 }
        : side === 'L'
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 }; // 'R'

  // Push label outward from endpoint/marker.
  // For LEFT/RIGHT anchors, the label bbox can otherwise still intersect the node even when
  // placed above/below the line (because x is only slightly outside the node). Compensate by
  // adding ~half the text width to the outward distance.
  const baseAlongOut = hasDiamondMarker ? 22 : 12;
  const approxTextW = estimateTextBBox({ x: 0, y: 0 }, text).w;
  const extraAlongOut = side === 'L' || side === 'R' ? Math.ceil(approxTextW / 2) + 2 : 0;
  const alongOut = baseAlongOut + extraAlongOut;
  const anchor: Point = { x: endPt.x + outward.x * alongOut, y: endPt.y + outward.y * alongOut };

  // Exclusion zone around marker/endpoint (avoid diamonds etc.)
  const markerR = hasDiamondMarker ? 14 : 6;
  const markerRect = { x: endPt.x - markerR, y: endPt.y - markerR, w: markerR * 2, h: markerR * 2 };

  // Candidate offset axis (screen-space), chosen to keep labels close and predictable:
  // - If edge enters TOP/BOTTOM: try LEFT, then RIGHT, else CENTER on the edge.
  // - If edge enters LEFT/RIGHT: try ABOVE, then BELOW, else CENTER on the edge.
  const primaryAxis: Point = side === 'T' || side === 'B' ? { x: -1, y: 0 } : { x: 0, y: -1 };
  const secondaryAxis: Point = side === 'T' || side === 'B' ? { x: 1, y: 0 } : { x: 0, y: 1 };

  // Distance from edge to label center. Keep tighter for plain ends, larger for diamonds.
  // In crowded situations, slightly increase to avoid sitting on top of a neighboring edge.
  const baseD = hasDiamondMarker ? 14 : 8;
  const d = baseD + (crowdCount > 1 ? 4 : 0);

  const pad = crowdCount > 1 ? 4 : 3;

  const isClean = (pos: Point): boolean => {
    const bbox = estimateTextBBox(pos, text);
    if (rectIntersectsRect(bbox, markerRect)) return false;
    if (rectIntersectsRect(bbox, nodeRect)) return false;
    for (const s of avoidSegments) {
      if (segmentIntersectsRect(s.a, s.b, bbox, pad)) return false;
    }
    return true;
  };

  // Try increasing distances while keeping the preferred ordering (primary then secondary).
  // This avoids the common failure mode where both candidates are "almost" clean but
  // still intersect a neighboring parallel relationship when edges are close together.
  const step = hasDiamondMarker ? 6 : 5;
  const maxK = hasDiamondMarker ? 5 : 6;
  for (let k = 0; k < maxK; k++) {
    const dd = d + k * step;
    const pos1: Point = { x: anchor.x + primaryAxis.x * dd, y: anchor.y + primaryAxis.y * dd };
    if (isClean(pos1)) return { x: pos1.x, y: pos1.y, dy: 0 };

    const pos2: Point = { x: anchor.x + secondaryAxis.x * dd, y: anchor.y + secondaryAxis.y * dd };
    if (isClean(pos2)) return { x: pos2.x, y: pos2.y, dy: 0 };
  }

  // Fallback: center on the relationship (keeps association obvious even when crowded).
  return { x: anchor.x, y: anchor.y, dy: 0 };
}
