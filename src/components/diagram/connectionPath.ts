import type { ViewConnection, ViewConnectionRouteKind } from '../../domain';
import { polylineMidPoint, type Point } from './geometry';
import { routeOrthogonalAStarDetailed, type OrthogonalAStarBounds } from './orthogonalAStarRouter';
import { computeStubbedEndpoints } from './orthogonalHints';

export type OrthogonalRoutingAxis = 'h' | 'v';

/** Cardinal directions in diagram model coordinates (y grows downward). */
export type OrthogonalRoutingDir = 'N' | 'E' | 'S' | 'W';

/** Optional hints used by the orthogonal auto-router to prefer the first/last segment axis. */
export type OrthogonalRoutingHints = {
  /** Prefer the first segment to be horizontal (h) or vertical (v). */
  preferStartAxis?: OrthogonalRoutingAxis;
  /** Prefer the last segment to be horizontal (h) or vertical (v). */
  preferEndAxis?: OrthogonalRoutingAxis;

  /** Optional explicit direction out of the source anchor (used by grid routers / stubs). */
  startDir?: OrthogonalRoutingDir;
  /** Optional explicit direction into the target anchor (used by grid routers / stubs). */
  endDir?: OrthogonalRoutingDir;

  /** Optional stub length (in model units) when creating an initial/terminal segment. */
  stubLength?: number;
  /** Grid size used when choosing a "channel" coordinate for 3-segment routes. */
  gridSize?: number;

  /** Optional lane offset (in model units) applied to the chosen orthogonal channel. */
  laneOffset?: number;

  /** Spacing between candidate channel "lanes" when searching for a clear route. Defaults to gridSize/2. */
  laneSpacing?: number;

  /** Maximum number of lane steps to search in each direction when avoiding obstacles. Defaults to 10. */
  maxChannelShiftSteps?: number;

  /** Rectangles to avoid when auto-routing (typically other nodes in the view). */
  obstacles?: Array<{ x: number; y: number; w: number; h: number }>;

  /** Additional margin added around obstacles (in model units). Defaults to gridSize/2. */
  obstacleMargin?: number;

  /** Optional previous routed polyline (used for local re-route bounds). */
  seedPath?: Point[];

  /** Optional explicit bounds override for the grid router. */
  bounds?: OrthogonalAStarBounds;

  /** Padding (model units) added around seed path bounds when doing local re-routing. */
  localReroutePadding?: number;

  /** Optional: minimum segment length (model units) used by the post-pass beautifier. Defaults to 0 (disabled). */
  minSegmentLength?: number;
};

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

type BeautifyOptions = {
  gridSize?: number;
  minSegmentLength?: number;
  obstacles?: Rect[];
  obstacleMargin?: number;
};

/**
 * Try to shorten an orthogonal polyline by replacing subpaths with obstacle-clear
 * straight segments or simple L-shaped shortcuts.
 *
 * This is a lightweight "rubber-banding" post-pass that tends to collapse
 * A* grid "staircases" (alternating turns) into cleaner long segments.
 */
function shortcutOrthogonalPolyline(points: Point[], obstacles: Rect[], margin: number): Point[] {
  if (points.length < 4) return points.slice();

  // Only apply to already-orthogonal polylines.
  for (let i = 0; i < points.length - 1; i += 1) {
    if (axisOfSegment(points[i], points[i + 1]) === null) return points.slice();
  }

  const baseHits = obstacles.length ? obstacleHitCount(points, obstacles, margin) : 0;
  let cur = points.slice();
  let changed = true;

  const tryShortcut = (a: Point, b: Point): Point[] | null => {
    // Straight shortcut.
    if ((a.x === b.x || a.y === b.y) && straightIsClear(a, b, obstacles, margin)) return [a, b];

    // L shortcuts (two possible corners).
    const c1: Point = { x: a.x, y: b.y };
    if (straightIsClear(a, c1, obstacles, margin) && straightIsClear(c1, b, obstacles, margin)) return [a, c1, b];

    const c2: Point = { x: b.x, y: a.y };
    if (straightIsClear(a, c2, obstacles, margin) && straightIsClear(c2, b, obstacles, margin)) return [a, c2, b];

    return null;
  };

  while (changed) {
    changed = false;

    const curLen = manhattanLength(cur);

    // Greedy: find the first improving shortcut scanning left-to-right.
    // IMPORTANT: do not allow shortcuts that touch the true endpoints (index 0 / last).
    // We rely on the 1st and last segments to preserve “port + direction first” stubs,
    // so collapsing those can produce visually-wrong approaches (e.g. entering a bottom port horizontally).
    outer: for (let i = 1; i < cur.length - 3; i += 1) {
      for (let k = cur.length - 2; k >= i + 2; k -= 1) {
        const a = cur[i];
        const b = cur[k];
        const shortcut = tryShortcut(a, b);
        if (!shortcut) continue;

        const cand = simplifyPolyline([...cur.slice(0, i), ...shortcut, ...cur.slice(k + 1)]);
        if (cand.length >= cur.length) continue;

        const hits = obstacles.length ? obstacleHitCount(cand, obstacles, margin) : 0;
        if (hits > baseHits) continue;

        const candLen = manhattanLength(cand);
        // Prefer reductions in vertex count; if equal, require a length improvement.
        if (cand.length < cur.length || candLen < curLen - 1e-6) {
          cur = cand;
          changed = true;
          break outer;
        }
      }
    }
  }

  return simplifyPolyline(cur);
}

// Exposed for unit testing of the post-pass (not used by app code).
export function __testOnly_shortcutOrthogonalPolyline(points: Point[], obstacles: Rect[], margin: number): Point[] {
  return shortcutOrthogonalPolyline(points, obstacles, margin);
}

function snapInteriorRunsToGrid(points: Point[], gridSize: number): Point[] {
  if (!gridSize || gridSize <= 0 || points.length < 4) return points.slice();
  const out = points.map((p) => ({ ...p }));
  const lastIdx = out.length - 1;

  const segAxis: Array<OrthogonalRoutingAxis | null> = [];
  for (let i = 0; i < out.length - 1; i += 1) segAxis.push(axisOfSegment(out[i], out[i + 1]));
  if (segAxis.some((a) => a === null)) return out; // only for orthogonal polylines

  type Run = { axis: OrthogonalRoutingAxis; segStart: number; segEnd: number };
  const runs: Run[] = [];
  let curAxis = segAxis[0] as OrthogonalRoutingAxis;
  let curStart = 0;
  for (let i = 1; i < segAxis.length; i += 1) {
    const a = segAxis[i] as OrthogonalRoutingAxis;
    if (a !== curAxis) {
      runs.push({ axis: curAxis, segStart: curStart, segEnd: i - 1 });
      curAxis = a;
      curStart = i;
    }
  }
  runs.push({ axis: curAxis, segStart: curStart, segEnd: segAxis.length - 1 });

  for (const r of runs) {
    const pStartIdx = r.segStart;
    const pEndIdx = r.segEnd + 1;
    // Never move true endpoints.
    if (pStartIdx === 0 || pEndIdx === lastIdx) continue;

    if (r.axis === 'v') {
      const x = out[pStartIdx].x;
      const sx = roundToGrid(x, gridSize);
      for (let i = pStartIdx; i <= pEndIdx; i += 1) out[i].x = sx;
    } else {
      const y = out[pStartIdx].y;
      const sy = roundToGrid(y, gridSize);
      for (let i = pStartIdx; i <= pEndIdx; i += 1) out[i].y = sy;
    }
  }
  return out;
}

function beautifyOrthogonalPolyline(points: Point[], opts?: BeautifyOptions): Point[] {
  let cur = simplifyPolyline(points);
  if (cur.length < 2) return cur;

  const gridSize = opts?.gridSize;
  const minSeg = opts?.minSegmentLength ?? 0;
  const obstacles = opts?.obstacles ?? [];
  const margin = opts?.obstacleMargin ?? (gridSize && gridSize > 0 ? gridSize / 2 : 10);

  let curHits = obstacles.length ? obstacleHitCount(cur, obstacles, margin) : 0;

  // 1) Snap interior runs to the routing grid (never touches endpoints).
  if (gridSize && gridSize > 0) {
    const snapped = simplifyPolyline(snapInteriorRunsToGrid(cur, gridSize));
    const hits = obstacles.length ? obstacleHitCount(snapped, obstacles, margin) : 0;
    if (hits <= curHits) {
      cur = snapped;
      curHits = hits;
    }
  }

  // 2) Collapse common A* "staircases" by shortcutting clear segments.
  if (obstacles.length && cur.length >= 4) {
    const shortcutted = shortcutOrthogonalPolyline(cur, obstacles, margin);
    const hits = obstacles.length ? obstacleHitCount(shortcutted, obstacles, margin) : 0;
    if (hits <= curHits) {
      cur = shortcutted;
      curHits = hits;
    }
  }

  // 3) Optionally remove tiny corners when it does not make the route worse.
  if (minSeg > 0 && cur.length >= 3) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 1; i < cur.length - 1; i += 1) {
        const p0 = cur[i - 1];
        const p1 = cur[i];
        const p2 = cur[i + 1];
        const a1 = axisOfSegment(p0, p1);
        const a2 = axisOfSegment(p1, p2);
        if (!a1 || !a2 || a1 === a2) continue;
        const seg1 = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y);
        const seg2 = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
        if (seg1 >= minSeg && seg2 >= minSeg) continue;

        // Only collapse if the neighbors are aligned so we can remove the corner without introducing diagonals.
        if (p0.x !== p2.x && p0.y !== p2.y) continue;
        const cand = simplifyPolyline([...cur.slice(0, i), ...cur.slice(i + 1)]);
        const hits = obstacles.length ? obstacleHitCount(cand, obstacles, margin) : 0;
        if (hits <= curHits) {
          cur = cand;
          curHits = hits;
          changed = true;
          break;
        }
      }
    }
  }

  return simplifyPolyline(cur);
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

function orthogonalAutoPolylineLegacy(a: Point, b: Point, hints?: OrthogonalRoutingHints): Point[] {
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

function reverseDir(d?: OrthogonalRoutingDir): OrthogonalRoutingDir | undefined {
  switch (d) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'E':
      return 'W';
    case 'W':
      return 'E';
    default:
      return undefined;
  }
}

function firstAxisPreference(hints?: OrthogonalRoutingHints): 'h' | 'v' | undefined {
  if (hints?.preferStartAxis) return hints.preferStartAxis;
  // If an explicit direction exists, infer axis.
  if (hints?.startDir === 'E' || hints?.startDir === 'W') return 'h';
  if (hints?.startDir === 'N' || hints?.startDir === 'S') return 'v';
  return undefined;
}

function lastAxisPreference(hints?: OrthogonalRoutingHints): 'h' | 'v' | undefined {
  if (hints?.preferEndAxis) return hints.preferEndAxis;
  if (hints?.endDir === 'E' || hints?.endDir === 'W') return 'h';
  if (hints?.endDir === 'N' || hints?.endDir === 'S') return 'v';
  return undefined;
}

/**
 * Create an orthogonal "bridge" polyline from an arbitrary point to a grid-snapped point.
 *
 * This keeps the overall route orthogonal even when endpoints are not exactly on the routing grid.
 */
function orthogonalBridge(from: Point, to: Point, axisPref?: OrthogonalRoutingAxis): Point[] {
  if (from.x === to.x || from.y === to.y) return [from, to];
  // Choose whether to go horizontally first or vertically first.
  if (axisPref === 'h') return [from, { x: to.x, y: from.y }, to];
  return [from, { x: from.x, y: to.y }, to];
}

function straightIsClear(a: Point, b: Point, obstacles: Rect[], margin: number): boolean {
  if (!obstacles.length) return true;
  const inflated = obstacles.map((o) => inflateRect(o, margin));
  for (const r of inflated) {
    if (segmentIntersectsRect(a, b, r)) return false;
  }
  return true;
}

function boundsFromPoints(points: Point[], pad: number): OrthogonalAStarBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: -pad, minY: -pad, maxX: pad, maxY: pad };
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function orthogonalAutoPolyline(a: Point, b: Point, hints?: OrthogonalRoutingHints): Point[] {
  const obstacles = (hints?.obstacles ?? []) as Rect[];
  const hasObstacles = obstacles.length > 0;

  // Preserve the legacy (very stable) behavior when we have no obstacle-avoidance needs.
  // This also keeps existing "axis preference" semantics unchanged for simple cases.
  if (!hasObstacles) return orthogonalAutoPolylineLegacy(a, b, hints);

  const gridSize = hints?.gridSize && hints.gridSize > 0 ? hints.gridSize : 10;
  const margin = hints?.obstacleMargin ?? gridSize / 2;

  // Prefer “port + direction first”: create small stubs that leave/enter nodes on the expected side.
  // This greatly improves perceived routing quality (and marker orientation) while dragging.
  const stubbed = computeStubbedEndpoints(a, b, {
    startDir: hints?.startDir,
    endDir: hints?.endDir,
    stubLength: hints?.stubLength,
    gridSize,
  });

  const aligned = a.x === b.x || a.y === b.y;
  if (aligned && straightIsClear(a, b, obstacles, margin)) return [a, b];

  // Route between grid-snapped *stub* endpoints, then bridge back to true anchors.
  const aStub = stubbed.startOutside;
  const bStub = stubbed.endOutside;

  // Bridge stub endpoints to the routing grid to avoid diagonal segments.
  const aG: Point = { x: roundToGrid(aStub.x, gridSize), y: roundToGrid(aStub.y, gridSize) };
  const bG: Point = { x: roundToGrid(bStub.x, gridSize), y: roundToGrid(bStub.y, gridSize) };

  // Anchor -> stub is already orthogonal (when dirs are present); stub -> grid may need a bridge.
  const startToStub = orthogonalBridge(a, aStub, firstAxisPreference(hints));
  const startBridge = orthogonalBridge(aStub, aG, firstAxisPreference(hints));
  const endBridge = orthogonalBridge(bG, bStub, lastAxisPreference(hints));
  const stubToEnd = orthogonalBridge(bStub, b, lastAxisPreference(hints));

  try {
    const baseOpts = {
      start: aG,
      end: bG,
      gridSize,
      obstacles,
      obstacleMargin: margin,
      // Bend penalty is tuned for "diagram feel" rather than strict shortest-path.
      bendPenalty: 8,
      // Direction constraints prevent the grid router from immediately turning back toward the node.
      startDir: hints?.startDir,
      endDir: reverseDir(hints?.endDir),
    } as const;

    // Local re-route bounds: if we have a seed path, try a bounded A* first.
    const seed = hints?.seedPath;
    const pad = hints?.localReroutePadding ?? gridSize * 12;
    const localBounds = hints?.bounds ?? (seed && seed.length >= 2 ? boundsFromPoints([...seed, aG, bG], pad) : undefined);

    const firstAttempt = routeOrthogonalAStarDetailed({ ...baseOpts, bounds: localBounds });
    const secondAttempt = firstAttempt.status === 'fallback' && localBounds ? routeOrthogonalAStarDetailed({ ...baseOpts }) : firstAttempt;
    const aStarPoints = secondAttempt.points;

    const combined: Point[] = [];
    combined.push(...startToStub);
    if (startBridge.length > 1) combined.push(...startBridge.slice(1));
    // Join, skipping duplicate points.
    if (aStarPoints.length > 1) combined.push(...aStarPoints.slice(1));
    if (endBridge.length > 1) combined.push(...endBridge.slice(1));
    if (stubToEnd.length > 1) combined.push(...stubToEnd.slice(1));

    const simplified = beautifyOrthogonalPolyline(combined, {
      gridSize,
      minSegmentLength: hints?.minSegmentLength ?? 0,
      obstacles,
      obstacleMargin: margin,
    });
    if (simplified.length >= 2) {
      simplified[0] = a;
      simplified[simplified.length - 1] = b;
    }
    return simplified;
  } catch {
    // Safe fallback: keep the existing, battle-tested router if A* fails.
    return orthogonalAutoPolylineLegacy(a, b, hints);
  }
}

export function connectionPolylinePoints(
  routeKind: ViewConnectionRouteKind,
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
