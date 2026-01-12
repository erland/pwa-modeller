import type { Point } from './geometry';
import { findBestOrthogonalRouteBetweenRects, type Rect, type OrthogonalPathfinderOptions } from './orthogonalPathfinder';

export type PathfinderBatchRequest = {
  id: string;
  sourceRect: Rect;
  targetRect: Rect;
  obstacles: Rect[];
  options: OrthogonalPathfinderOptions;
};

/**
 * Create thin rectangle obstacles around a polyline's interior segments.
 * These are used as *soft* obstacles (penalized, not blocked) to reduce
 * collisions/overlaps between multiple connections.
 */
export function polylineToSoftRects(points: Point[], radius: number, skipEndpointSegments: number = 1): Rect[] {
  if (points.length < 2) return [];
  const rects: Rect[] = [];
  const startSeg = Math.max(0, skipEndpointSegments);
  const endSeg = Math.max(0, points.length - 1 - skipEndpointSegments);

  for (let i = startSeg; i < endSeg; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x === b.x) {
      // vertical
      const x = a.x - radius;
      const y = Math.min(a.y, b.y) - radius;
      const h = Math.abs(b.y - a.y) + radius * 2;
      rects.push({ x, y, w: radius * 2, h });
    } else if (a.y === b.y) {
      // horizontal
      const x = Math.min(a.x, b.x) - radius;
      const y = a.y - radius;
      const w = Math.abs(b.x - a.x) + radius * 2;
      rects.push({ x, y, w, h: radius * 2 });
    } else {
      // Shouldn't happen for orthogonal, but be safe: bound the segment.
      const x = Math.min(a.x, b.x) - radius;
      const y = Math.min(a.y, b.y) - radius;
      const w = Math.abs(b.x - a.x) + radius * 2;
      const h = Math.abs(b.y - a.y) + radius * 2;
      rects.push({ x, y, w, h });
    }
  }

  return rects;
}

export type SoftAvoidanceOptions = {
  /** Corridor radius used when turning already-routed segments into soft obstacles. */
  softRadius: number;
  /** Penalty added to an edge cost when it crosses a soft obstacle. */
  softPenalty: number;
  /**
   * How many segments at each end to exclude from soft obstacles.
   * 1 skips the first and last segment (stubs) which commonly touch nodes.
   */
  skipEndpointSegments?: number;
};

/**
 * Route many orthogonal connections sequentially, penalizing overlap with
 * already-routed connections (soft obstacles). Falls back to no soft
 * obstacles if the penalized route cannot be found.
 *
 * Deterministic ordering: by request id.
 */
export function routeOrthogonalBatchWithSoftAvoidance(
  requests: PathfinderBatchRequest[],
  opts: SoftAvoidanceOptions
): Map<string, Point[]> {
  const out = new Map<string, Point[]>();
  const softRects: Rect[] = [];

  const stable = [...requests].sort((a, b) => a.id.localeCompare(b.id));

  for (const r of stable) {
    const baseParams = {
      sourceRect: r.sourceRect,
      targetRect: r.targetRect,
      obstacles: r.obstacles,
      options: r.options,
    };

    let route = findBestOrthogonalRouteBetweenRects({
      ...baseParams,
      softObstacles: softRects,
      softPenalty: opts.softPenalty,
    });

    if (!route) {
      // If penalized routing fails, fall back to the normal router.
      route = findBestOrthogonalRouteBetweenRects(baseParams);
    }

    if (!route) continue;

    out.set(r.id, route.points);
    const added = polylineToSoftRects(route.points, opts.softRadius, opts.skipEndpointSegments ?? 1);
    softRects.push(...added);
  }

  return out;
}
