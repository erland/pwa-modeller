import type { ViewConnection, ViewConnectionRouteKind } from '../../domain';
import { polylineMidPoint, type Point } from './geometry';

export type ConnectionPathResult = {
  /** Polyline points used to render the connection (including endpoints). */
  points: Point[];
  /** SVG path string for the polyline. */
  d: string;
  /** Unit vector tangent direction at the end of the polyline (for markers). */
  endTangent: Point;
  /** Midpoint along the polyline length (for labels). */
  midPoint: Point;
};

function unitVec(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function polylineToSvgPath(points: Point[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export function endTangentForPolyline(points: Point[]): Point {
  if (points.length < 2) return { x: 1, y: 0 };
  // Use the last non-degenerate segment.
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) > 1e-6) return unitVec(dx, dy);
  }
  return { x: 1, y: 0 };
}

export function orthogonalAutoPolyline(a: Point, b: Point): Point[] {
  // If already aligned horizontally/vertically, no bend needed.
  if (a.x === b.x || a.y === b.y) return [a, b];
  // Simple 1-bend Manhattan routing: vertical then horizontal (stable default).
  const bend: Point = { x: a.x, y: b.y };
  return [a, bend, b];
}

export function connectionPolylinePoints(
  routeKind: ViewConnectionRouteKind,
  a: Point,
  b: Point,
  bendPoints?: Array<{ x: number; y: number }>
): Point[] {
  if (routeKind === 'straight') return [a, b];

  if (routeKind === 'orthogonal') {
    if (bendPoints && bendPoints.length > 0) {
      return [a, ...bendPoints.map((p) => ({ x: p.x, y: p.y })), b];
    }
    return orthogonalAutoPolyline(a, b);
  }

  // Fallback for future kinds.
  return [a, b];
}

/**
 * Canonical path generation for a view connection.
 *
 * This is intentionally UI-layer (diagram) code: it produces SVG path + geometry helpers
 * (tangent + midpoint) to be shared by canvas rendering and export.
 */
export function getConnectionPath(
  conn: Pick<ViewConnection, 'route' | 'points'>,
  endpoints: { a: Point; b: Point }
): ConnectionPathResult {
  const points = connectionPolylinePoints(conn.route.kind, endpoints.a, endpoints.b, conn.points);
  const d = polylineToSvgPath(points);
  const endTangent = endTangentForPolyline(points);
  const midPoint = polylineMidPoint(points);
  return { points, d, endTangent, midPoint };
}
