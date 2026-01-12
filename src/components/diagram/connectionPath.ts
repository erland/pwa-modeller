import type { ViewConnection } from '../../domain';
import { polylineMidPoint, type Point } from './geometry';
import { connectionPolylinePoints, type OrthogonalRoutingHints } from '../../diagram/routing/engine';

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
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / l, y: dy / l };
}

export function polylineToSvgPath(points: Point[]): string {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export function endTangentForPolyline(points: Point[]): Point {
  if (points.length < 2) return { x: 1, y: 0 };
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx !== 0 || dy !== 0) return unitVec(dx, dy);
  }
  return { x: 1, y: 0 };
}

/**
 * Canonical path generation for a view connection.
 *
 * This is intentionally UI-layer (diagram) code: it produces SVG path + geometry helpers
 * (tangent + midpoint) to be shared by canvas rendering and export.
 */
export function getConnectionPath(
  conn: Pick<ViewConnection, 'route' | 'points'>,
  endpoints: { a: Point; b: Point; hints?: OrthogonalRoutingHints }
): ConnectionPathResult {
  const points = connectionPolylinePoints(conn.route.kind, endpoints.a, endpoints.b, conn.points, endpoints.hints);
  const d = polylineToSvgPath(points);
  const endTangent = endTangentForPolyline(points);
  const midPoint = polylineMidPoint(points);
  return { points, d, endTangent, midPoint };
}
