// Standalone, pure routing engine for diagram connections.
// This module is intentionally UI-agnostic (no React/store access) and is easy to unit test.

export type Point = { x: number; y: number };

export type ConnectionRouteKind = 'orthogonal' | 'straight';

export type OrthogonalRoutingAxis = 'h' | 'v';

/** Optional hints used by the orthogonal auto-router to prefer the first/last segment axis. */
export type OrthogonalRoutingHints = {
  /** Prefer the first segment to be horizontal (h) or vertical (v). */
  preferStartAxis?: OrthogonalRoutingAxis;
  /** Prefer the last segment to be horizontal (h) or vertical (v). */
  preferEndAxis?: OrthogonalRoutingAxis;
  /** Grid size used when choosing a "channel" coordinate for 3-segment routes. */
  gridSize?: number;

  /** Optional lane offset (in model units) applied to the chosen orthogonal channel. */
  laneOffset?: number;

  /** Distance between adjacent candidate channels when searching for a clear route. Defaults to gridSize/2. */
  laneSpacing?: number;

  /** Maximum number of lane steps to search in each direction when avoiding obstacles. Defaults to 10. */
  maxChannelShiftSteps?: number;

  /** Rectangles to avoid when auto-routing (typically other nodes in the view). */
  obstacles?: Array<{ x: number; y: number; w: number; h: number }>;

  /** Additional margin added around obstacles (in model units). Defaults to gridSize/2. */
  obstacleMargin?: number;
};

function manhattanLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    len += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  }
  return len;
}

function axisOfSegment(a: Point, b: Point): OrthogonalRoutingAxis | null {
  if (a.x === b.x && a.y !== b.y) return 'v';
  if (a.y === b.y && a.x !== b.x) return 'h';
  return null;
}

function simplifyPolyline(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice();

  // Remove consecutive duplicates.
  const deduped: Point[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const cur = points[i];
    if (prev.x === cur.x && prev.y === cur.y) continue;
    deduped.push(cur);
  }
  if (deduped.length <= 2) return deduped;

  // Remove collinear midpoints.
  const simplified: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const p0 = simplified[simplified.length - 1];
    const p1 = deduped[i];
    const p2 = deduped[i + 1];
    const a1 = axisOfSegment(p0, p1);
    const a2 = axisOfSegment(p1, p2);
    if (a1 && a2 && a1 === a2) {
      // p1 is redundant on a straight run.
      continue;
    }
    simplified.push(p1);
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

function roundToGrid(value: number, gridSize?: number): number {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

type Rect = { x: number; y: number; w: number; h: number };

function inflateRect(r: Rect, margin: number): Rect {
  if (!margin) return r;
  return { x: r.x - margin, y: r.y - margin, w: r.w + margin * 2, h: r.h + margin * 2 };
}

function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y0 = r.y;
  const y1 = r.y + r.h;

  // Vertical segment.
  if (a.x === b.x && a.y !== b.y) {
    const x = a.x;
    const ymin = Math.min(a.y, b.y);
    const ymax = Math.max(a.y, b.y);
    return x >= x0 && x <= x1 && ymax >= y0 && ymin <= y1;
  }

  // Horizontal segment.
  if (a.y === b.y && a.x !== b.x) {
    const y = a.y;
    const xmin = Math.min(a.x, b.x);
    const xmax = Math.max(a.x, b.x);
    return y >= y0 && y <= y1 && xmax >= x0 && xmin <= x1;
  }

  // Non-orthogonal fallback: bounding-box overlap.
  const xmin = Math.min(a.x, b.x);
  const xmax = Math.max(a.x, b.x);
  const ymin = Math.min(a.y, b.y);
  const ymax = Math.max(a.y, b.y);
  const bbOverlaps = xmax >= x0 && xmin <= x1 && ymax >= y0 && ymin <= y1;
  return bbOverlaps;
}

function obstacleHitCount(points: Point[], obstacles: Rect[], margin: number): number {
  if (!obstacles.length || points.length < 2) return 0;
  const inflated = obstacles.map((o) => inflateRect(o, margin));
  const hit = new Set<number>();
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < inflated.length; j += 1) {
      if (hit.has(j)) continue;
      if (segmentIntersectsRect(a, b, inflated[j])) hit.add(j);
    }
  }
  return hit.size;
}

function laneOffsets(maxSteps: number): number[] {
  const res: number[] = [0];
  for (let i = 1; i <= maxSteps; i += 1) {
    res.push(i);
    res.push(-i);
  }
  return res;
}

function scoreCandidate(points: Point[], hints?: OrthogonalRoutingHints): number {
  const simplified = simplifyPolyline(points);
  if (simplified.length < 2) return Number.POSITIVE_INFINITY;

  const firstAxis = axisOfSegment(simplified[0], simplified[1]);
  const lastAxis = axisOfSegment(simplified[simplified.length - 2], simplified[simplified.length - 1]);
  if (!firstAxis || !lastAxis) return Number.POSITIVE_INFINITY;

  let score = manhattanLength(simplified);

  // Prefer fewer segments if all else is equal.
  score += (simplified.length - 2) * 5;

  // Strongly prefer the requested start/end axes when hints are provided.
  if (hints?.preferStartAxis && firstAxis !== hints.preferStartAxis) score += 10_000;
  if (hints?.preferEndAxis && lastAxis !== hints.preferEndAxis) score += 10_000;

  return score;
}

function chooseBestCandidate(candidates: Point[][], hints?: OrthogonalRoutingHints): Point[] {
  let best: Point[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const cand of candidates) {
    const s = scoreCandidate(cand, hints);
    if (s < bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  return simplifyPolyline(best ?? candidates[0] ?? []);
}

export function orthogonalAutoPolyline(a: Point, b: Point, hints?: OrthogonalRoutingHints): Point[] {
  const hasObstacles = !!(hints?.obstacles && hints.obstacles.length > 0);
  const aligned = a.x === b.x || a.y === b.y;

  // If already aligned and there are no obstacles to avoid, keep the simplest route.
  if (aligned && !hasObstacles) return [a, b];

  // Legacy stable default (no hints and no obstacles): vertical then horizontal.
  // If obstacles are provided, we still run the candidate/avoidance logic.
  if (!hints?.preferStartAxis && !hints?.preferEndAxis && !hasObstacles && !aligned) {
    return [a, { x: a.x, y: b.y }, b];
  }

  const straight: Point[] = [a, b];
  const lVerticalThenHorizontal: Point[] = [a, { x: a.x, y: b.y }, b];
  const lHorizontalThenVertical: Point[] = [a, { x: b.x, y: a.y }, b];

  const baseCandidates: Point[][] = aligned ? [straight] : [lVerticalThenHorizontal, lHorizontalThenVertical];

  const obstacles = (hints?.obstacles ?? []) as Rect[];
  const margin = hints?.obstacleMargin ?? (hints?.gridSize ? hints.gridSize / 2 : 10);
  const laneSpacing = hints?.laneSpacing ?? (hints?.gridSize ? hints.gridSize / 2 : 10);
  const maxShiftSteps = hints?.maxChannelShiftSteps ?? 10;
  const laneOffset = hints?.laneOffset ?? 0;

  type Scored = { points: Point[]; hits: number; score: number };
  const scored: Scored[] = [];

  const pushScored = (pts: Point[], extraScore = 0) => {
    const simplified = simplifyPolyline(pts);
    const hits = obstacles.length ? obstacleHitCount(simplified, obstacles, margin) : 0;
    // Huge penalty for obstacle intersections so any clear route wins.
    const s = scoreCandidate(simplified, hints) + extraScore + hits * 100_000;
    scored.push({ points: simplified, hits, score: s });
  };

  // Score the base L routes.
  for (const c of baseCandidates) pushScored(c);

  // Determine whether base candidates collide with obstacles.
  const minBaseHits = scored.reduce((m, s) => Math.min(m, s.hits), Number.POSITIVE_INFINITY);
  const needsAvoidance = hasObstacles && Number.isFinite(minBaseHits) && minBaseHits > 0;

  const addVerticalChannelCandidates = (reasonScore = 0) => {
    const baseX = roundToGrid((a.x + b.x) / 2, hints?.gridSize) + laneOffset;
    for (const step of laneOffsets(maxShiftSteps)) {
      const mx = baseX + step * laneSpacing;
      if (mx === a.x || mx === b.x) continue;
      const pts = [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
      pushScored(pts, Math.abs(step) * 50 + reasonScore);
    }
  };

  const addHorizontalChannelCandidates = (reasonScore = 0) => {
    const baseY = roundToGrid((a.y + b.y) / 2, hints?.gridSize) + laneOffset;
    for (const step of laneOffsets(maxShiftSteps)) {
      const my = baseY + step * laneSpacing;
      if (my === a.y || my === b.y) continue;
      const pts = [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
      pushScored(pts, Math.abs(step) * 50 + reasonScore);
    }
  };

  // Add and score channel-search variants for 3-segment routes.
  // 1) When hints explicitly request horizontal-horizontal or vertical-vertical.
  // 2) When the best base route intersects obstacles: "promote" to a 3-segment channel route and shift.
  const wantsHH = hints?.preferStartAxis === 'h' && hints?.preferEndAxis === 'h';
  const wantsVV = hints?.preferStartAxis === 'v' && hints?.preferEndAxis === 'v';

  if (wantsHH) addVerticalChannelCandidates(0);
  if (wantsVV) addHorizontalChannelCandidates(0);

  if (needsAvoidance) {
    // Prefer the channel type that is most likely to side-step a blocked straight corridor.
    // - If vertically aligned (or nearly so), shifting X is usually the best escape hatch.
    // - If horizontally aligned, shifting Y is usually best.
    if (a.x === b.x) {
      addVerticalChannelCandidates(200); // slight penalty vs explicitly requested routes
    } else if (a.y === b.y) {
      addHorizontalChannelCandidates(200);
    } else {
      // General case: try both channel types so we can escape whichever corridor is blocked.
      // Apply a small bias to favor candidates that match the requested axes when any are set.
      const hasStart = !!hints?.preferStartAxis;
      const hasEnd = !!hints?.preferEndAxis;
      const biasX = hasStart || hasEnd ? (hints?.preferStartAxis === 'h' || hints?.preferEndAxis === 'h' ? 0 : 250) : 0;
      const biasY = hasStart || hasEnd ? (hints?.preferStartAxis === 'v' || hints?.preferEndAxis === 'v' ? 0 : 250) : 0;
      addVerticalChannelCandidates(200 + biasX);
      addHorizontalChannelCandidates(200 + biasY);
    }
  }

  // Choose the best scored route.
  scored.sort((x, y) => x.score - y.score);
  return scored[0]?.points ?? chooseBestCandidate(baseCandidates, hints);
}

export function connectionPolylinePoints(
  routeKind: ConnectionRouteKind,
  a: Point,
  b: Point,
  bendPoints?: Array<{ x: number; y: number }>,
  hints?: OrthogonalRoutingHints
): Point[] {
  if (routeKind === 'straight') return [a, b];

  if (routeKind === 'orthogonal') {
    if (bendPoints && bendPoints.length > 0) {
      return [a, ...bendPoints.map((p) => ({ x: p.x, y: p.y })), b];
    }
    return orthogonalAutoPolyline(a, b, hints);
  }

  // Fallback for future kinds.
  return [a, b];
}
