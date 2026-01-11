import type { ViewNodeLayout } from '../../domain';
import type { ConnectableRef } from './connectable';

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
    if (!n.elementId) continue;
    if (excludeElementId && n.elementId === excludeElementId) continue;
    const w = n.width ?? 120;
    const h = n.height ?? 60;
    if (p.x >= n.x && p.x <= n.x + w && p.y >= n.y && p.y <= n.y + h) return n.elementId!;
  }
  return null;
}

export function nodeRefFromLayout(n: ViewNodeLayout): ConnectableRef | null {
  if (n.elementId) return { kind: 'element', id: n.elementId };
  if (n.connectorId) return { kind: 'connector', id: n.connectorId };
  return null;
}

export function hitTestConnectable(nodes: ViewNodeLayout[], p: Point, exclude: ConnectableRef | null): ConnectableRef | null {
  // Iterate from end to start so later-rendered nodes win if they overlap.
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i];
    const r = nodeRefFromLayout(n);
    if (!r) continue;
    if (exclude && exclude.kind === r.kind && exclude.id === r.id) continue;
    const w = n.width ?? (n.connectorId ? 24 : 120);
    const h = n.height ?? (n.connectorId ? 24 : 60);
    if (p.x >= n.x && p.x <= n.x + w && p.y >= n.y && p.y <= n.y + h) return r;
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

/** Minimum distance from point p to the segment [a,b]. */
export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 < 1e-12) return Math.hypot(apx, apy);
  const t = clamp((apx * abx + apy * aby) / abLen2, 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Minimum distance from point p to a polyline (points interpreted as consecutive segments). */
export function distancePointToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    const d = distancePointToSegment(p, points[i], points[i + 1]);
    if (d < best) best = d;
  }
  return best;
}
