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
 * - only handle 3-segment orthogonal polylines (4 points)
 * - corridor is the middle segment (p1 -> p2)
 */
function laneInfoForPolyline(points: Point[], gridSize?: number): LaneInfo | null {
  if (!points || points.length !== 4) return null;
  const [p0, p1, p2, p3] = points;
  const o0 = segmentOrientation(p0, p1);
  const o1 = segmentOrientation(p1, p2);
  const o2 = segmentOrientation(p2, p3);
  if (o0 === 'd' || o1 === 'd' || o2 === 'd') return null;
  // Typical 3-segment orthogonal: first and last have same orientation, middle is perpendicular.
  if (o0 !== o2) return null;
  if (o1 === o0) return null;

  const bandStep = (gridSize ?? 20) * 4;
  if (o1 === 'v') {
    const channelX = (p1.x + p2.x) / 2;
    const band = quantize((p1.y + p2.y) / 2, bandStep);
    const channel = quantize(channelX, gridSize ?? 20);
    return { key: `x:${channel}:${band}`, axis: 'x', indices: [1, 2] };
  }
  // o1 === 'h'
  const channelY = (p1.y + p2.y) / 2;
  const band = quantize((p1.x + p2.x) / 2, bandStep);
  const channel = quantize(channelY, gridSize ?? 20);
  return { key: `y:${channel}:${band}`, axis: 'y', indices: [1, 2] };
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

