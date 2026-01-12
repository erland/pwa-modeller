import type { Point } from './geometry';

type LaneAxis = 'x' | 'y';

type LaneInfo = {
  key: string;
  axis: LaneAxis;
  indices: number[]; // indices of points to shift
};

function quantize(v: number, step: number): number {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

function segmentOrientation(a: Point, b: Point, eps = 0.0001): 'h' | 'v' | 'd' {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) <= eps && Math.abs(dx) > eps) return 'h';
  if (Math.abs(dx) <= eps && Math.abs(dy) > eps) return 'v';
  if (Math.abs(dx) <= eps && Math.abs(dy) <= eps) return 'd';
  return 'd';
}

/**
 * Detect a "corridor" suitable for lane offsets. For now we keep it intentionally simple:
 * - handle orthogonal polylines of length >= 4 points
 * - choose the longest *interior* run (horizontal or vertical) as the corridor
 *
 * The intent is to offset the most visually dominant "channel" segment so that
 * multiple connections that would otherwise overlap get cheap separation.
 */
function laneInfoForPolyline(points: Point[], gridSize?: number): LaneInfo | null {
  if (!points || points.length < 4) return null;

  const orients: Array<'h' | 'v' | 'd'> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    orients.push(segmentOrientation(points[i], points[i + 1]));
  }
  if (orients.some((o) => o === 'd')) return null;

  type Run = { kind: 'h' | 'v'; start: number; end: number; length: number };
  const runs: Run[] = [];
  let curKind: 'h' | 'v' = orients[0] as 'h' | 'v';
  let curStart = 0;
  let curLen = 0;
  for (let i = 0; i < orients.length; i += 1) {
    const k = orients[i] as 'h' | 'v';
    const segLen = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    if (i === 0) {
      curKind = k;
      curStart = 0;
      curLen = segLen;
      continue;
    }
    if (k !== curKind) {
      runs.push({ kind: curKind, start: curStart, end: i, length: curLen });
      curKind = k;
      curStart = i;
      curLen = segLen;
    } else {
      curLen += segLen;
    }
  }
  runs.push({ kind: curKind, start: curStart, end: orients.length, length: curLen });

  const lastIdx = points.length - 1;
  const interiorRuns = runs.filter((r) => r.start > 0 && r.end < lastIdx);
  if (interiorRuns.length === 0) return null;

  // Choose the longest interior run; tie-breaker is the most central run.
  const mid = (points[0].x + points[lastIdx].x + points[0].y + points[lastIdx].y) / 4;
  const scoreRun = (r: Run): number => {
    const pA = points[r.start];
    const pB = points[r.end];
    const center = (pA.x + pB.x + pA.y + pB.y) / 4;
    const centrality = Math.abs(center - mid);
    return r.length * 10_000 - centrality; // prioritize length heavily
  };

  let best = interiorRuns[0];
  let bestScore = scoreRun(best);
  for (const r of interiorRuns.slice(1)) {
    const s = scoreRun(r);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }

  const bandStep = (gridSize ?? 20) * 4;
  const indices: number[] = [];
  for (let i = best.start; i <= best.end; i += 1) indices.push(i);

  if (best.kind === 'v') {
    const channelX = points[best.start].x;
    const y0 = points[best.start].y;
    const y1 = points[best.end].y;
    const band = quantize((y0 + y1) / 2, bandStep);
    const channel = quantize(channelX, gridSize ?? 20);
    return { key: `x:${channel}:${band}`, axis: 'x', indices };
  }

  // best.kind === 'h'
  const channelY = points[best.start].y;
  const x0 = points[best.start].x;
  const x1 = points[best.end].x;
  const band = quantize((x0 + x1) / 2, bandStep);
  const channel = quantize(channelY, gridSize ?? 20);
  return { key: `y:${channel}:${band}`, axis: 'y', indices };
}

function laneIndexForPosition(i: number): number {
  // 0, +1, -1, +2, -2, ...
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 === 1 ? k : -k;
}

export type LaneOffsetItem = {
  id: string;
  points: Point[];
};

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

function polylineIntersectsAnyRect(points: Point[], obstacles: Rect[], margin: number): boolean {
  if (!obstacles.length || points.length < 2) return false;
  const inflated = obstacles.map((o) => inflateRect(o, margin));
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (const r of inflated) {
      if (segmentIntersectsRect(a, b, r)) return true;
    }
  }
  return false;
}

/**
 * Applies cheap "lane" offsets for connections that share a similar corridor.
 * Returns a new array with updated points (does not mutate the input items).
 */
export function applyLaneOffsets(items: LaneOffsetItem[], opts?: { gridSize?: number; laneSpacing?: number }): LaneOffsetItem[] {
  const gridSize = opts?.gridSize;
  const laneSpacing = opts?.laneSpacing ?? Math.max(8, (gridSize ?? 20) / 2);

  const infos = new Map<string, LaneInfo>();
  const groups = new Map<string, LaneOffsetItem[]>();

  for (const it of items) {
    const info = laneInfoForPolyline(it.points, gridSize);
    if (!info) continue;
    infos.set(it.id, info);
    const arr = groups.get(info.key) ?? [];
    arr.push(it);
    groups.set(info.key, arr);
  }

  if (groups.size === 0) return items.map((it) => ({ id: it.id, points: it.points.map((p) => ({ ...p })) }));

  const deltasById = new Map<string, number>();
  for (const [, groupItems] of groups) {
    if (groupItems.length <= 1) continue;
    const sorted = [...groupItems].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i += 1) {
      const lane = laneIndexForPosition(i);
      deltasById.set(sorted[i].id, lane * laneSpacing);
    }
  }

  return items.map((it) => {
    const delta = deltasById.get(it.id) ?? 0;
    const info = infos.get(it.id);
    const pts = it.points.map((p) => ({ ...p }));
    if (!info || delta === 0) return { id: it.id, points: pts };
    for (const idx of info.indices) {
      if (!pts[idx]) continue;
      if (info.axis === 'x') pts[idx].x += delta;
      else pts[idx].y += delta;
    }
    return { id: it.id, points: pts };
  });
}

export type LaneOffsetSafeOptions = {
  gridSize?: number;
  laneSpacing?: number;
  /** Obstacles to avoid per connection id (typically all other node rects in the view). */
  obstaclesById?: Map<string, Array<{ x: number; y: number; w: number; h: number }>>;
  /** Extra margin around obstacles (model units). Defaults to gridSize/2. */
  obstacleMargin?: number;
};

/**
 * Like applyLaneOffsets, but never returns a lane-adjusted polyline that intersects obstacles.
 * If the lane shift would cause an intersection, this falls back to the original polyline.
 */
export function applyLaneOffsetsSafely(items: LaneOffsetItem[], opts?: LaneOffsetSafeOptions): LaneOffsetItem[] {
  const adjusted = applyLaneOffsets(items, { gridSize: opts?.gridSize, laneSpacing: opts?.laneSpacing });
  const obstaclesById = opts?.obstaclesById;
  if (!obstaclesById || obstaclesById.size === 0) return adjusted;

  const margin = opts?.obstacleMargin ?? (opts?.gridSize ? opts.gridSize / 2 : 10);
  const originalById = new Map<string, Point[]>();
  for (const it of items) originalById.set(it.id, it.points.map((p) => ({ ...p })));

  return adjusted.map((it) => {
    const obstacles = obstaclesById.get(it.id) ?? [];
    if (!obstacles.length) return it;
    if (polylineIntersectsAnyRect(it.points, obstacles, margin)) {
      return { id: it.id, points: originalById.get(it.id) ?? it.points };
    }
    return it;
  });
}

