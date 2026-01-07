import type { ViewNodeLayout } from '../../domain';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export type Point = { x: number; y: number };

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsForNodes(nodes: ViewNodeLayout[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.width ?? 120));
    maxY = Math.max(maxY, n.y + (n.height ?? 60));
  }
  return { minX, minY, maxX, maxY };
}

export function hitTestNodeId(nodes: ViewNodeLayout[], p: Point, excludeElementId: string | null): string | null {
  // Iterate from end to start so later-rendered nodes win if they overlap.
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i];
    if (excludeElementId && n.elementId === excludeElementId) continue;
    const w = n.width ?? 120;
    const h = n.height ?? 60;
    if (p.x >= n.x && p.x <= n.x + w && p.y >= n.y && p.y <= n.y + h) return n.elementId;
  }
  return null;
}

export function rectEdgeAnchor(n: ViewNodeLayout, toward: Point): Point {
  // Returns a point on the rectangle border of node n in the direction of `toward`.
  const w = n.width ?? 120;
  const h = n.height ?? 60;
  const cx = n.x + w / 2;
  const cy = n.y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;

  // If the target is exactly at the center, just return center.
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = adx === 0 ? Number.POSITIVE_INFINITY : (w / 2) / adx;
  const sy = ady === 0 ? Number.POSITIVE_INFINITY : (h / 2) / ady;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function unitPerp(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, y: -1 };
  // Perpendicular (rotate 90 degrees).
  return { x: -dy / len, y: dx / len };
}

export function offsetPolyline(points: Point[], perp: Point, offset: number): Point[] {
  if (offset === 0) return points;
  return points.map((p) => ({ x: p.x + perp.x * offset, y: p.y + perp.y * offset }));
}

export function polylineMidPoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= half && seg > 1e-6) {
      const t = (half - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += seg;
  }
  return points[Math.max(0, points.length - 1)];
}
