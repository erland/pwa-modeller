import type { Point } from './geometry';

type LaneAxis = 'x' | 'y';

type LaneInfo = {
  key: string;
  axis: LaneAxis;
  indices: number[]; // indices of points to shift
  sortCoord: number;
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
 * Infer which side of the target a connection approaches based on the last segment direction.
 * This is used to group "fan-in" lanes near a target and to stabilize lane ordering.
 */
function inferTargetSideFromPoints(points: Point[]): LaneOffsetSide | undefined {
  if (!points || points.length < 2) return undefined;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) return 'left';
    if (dx < 0) return 'right';
    return undefined;
  }
  if (dy > 0) return 'top';
  if (dy < 0) return 'bottom';
  return undefined;
}

function laneIndicesMonotonic(count: number): number[] {
  if (count <= 1) return [0];
  // Odd: -k..0..+k
  if (count % 2 === 1) {
    const k = Math.floor(count / 2);
    return Array.from({ length: count }, (_, i) => i - k);
  }
  // Even: avoid 0 to reduce overlap at the center, but keep order monotonic.
  // 2 => [-1, +1]
  // 4 => [-2, -1, +1, +2]
  // 6 => [-3, -2, -1, +1, +2, +3]
  const k = count / 2;
  const left = Array.from({ length: k }, (_, i) => -(k - i));
  const right = Array.from({ length: k }, (_, i) => i + 1);
  return [...left, ...right];
}

export type LaneOffsetSide = 'left' | 'right' | 'top' | 'bottom';

export type LaneOffsetItem = {
  id: string;
  points: Point[];
  /** Optional key identifying the target node (used to prevent crossings on fan-in). */
  targetKey?: string;
  /** Optional explicit target side; if omitted we infer it from the polyline's last segment. */
  targetSide?: LaneOffsetSide;
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

function isNear(a: number, b: number, eps = 0.0001): boolean {
  return Math.abs(a - b) <= eps;
}

function segmentLength(a: Point, b: Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

function uniqueIndices(indices: number[], maxExclusive: number): number[] {
  const set = new Set<number>();
  for (const i of indices) {
    if (i <= 0) continue; // never shift the first point (anchor)
    if (i >= maxExclusive - 1) continue; // never shift the last point (anchor)
    set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Detect a corridor suitable for lane offsets for any orthogonal-ish polyline.
 * Strategy:
 * 1) Ignore likely stubs near endpoints.
 * 2) Find the longest axis-aligned segment in the remaining core.
 * 3) Treat that segment (and any directly adjacent collinear segments) as the corridor.
 */
function laneInfoForPolyline(
  it: LaneOffsetItem,
  gridSize?: number,
  opts?: {
    stubLength?: number;
  }
): LaneInfo | null {
  const points = it.points;
  if (!points || points.length < 4) return null;

  const n = points.length;
  const gs = gridSize ?? 20;
  const bandStep = gs * 4;
  const stub = opts?.stubLength ?? Math.max(6, gs / 2);
  const stubThreshold = stub * 1.5;

  // Determine target side (if provided) early so we can prefer a corridor orientation
  // that separates fan-in lines near the target.
  const targetSide = it.targetSide ?? inferTargetSideFromPoints(points);
  // If the target is approached from left/right, the "fanning" corridor is typically vertical.
  // If approached from top/bottom, the corridor is typically horizontal.
  const preferredOri: 'h' | 'v' | null = targetSide === 'left' || targetSide === 'right' ? 'v' : targetSide ? 'h' : null;

  // Compute which segment indices are eligible for corridor detection.
  // Exclude the first and last segment (common stubs), and also exclude short end segments.
  const eligible: boolean[] = Array.from({ length: n - 1 }, () => true);
  if (n >= 5) {
    eligible[0] = false;
    eligible[n - 2] = false;
  }
  // Exclude short endpoint segments (helps when only one stub is present).
  if (segmentLength(points[0], points[1]) <= stubThreshold) eligible[0] = false;
  if (segmentLength(points[n - 2], points[n - 1]) <= stubThreshold) eligible[n - 2] = false;

  // Prefer a corridor segment close to the target. This reduces crossings in common
  // "fan-in" situations where multiple connections approach the same target side.
  // If none is found, fall back to the longest eligible orthogonal segment.
  const minLen = Math.max(6, gs / 2);

  let bestIdx = -1;
  let bestLen = -1;
  let bestOri: 'h' | 'v' | 'd' = 'd';

  for (let i = n - 2; i >= 0; i -= 1) {
    if (!eligible[i]) continue;
    const a = points[i];
    const b = points[i + 1];
    const o = segmentOrientation(a, b);
    if (o === 'd') continue;
    if (preferredOri && o !== preferredOri) continue;
    const len = segmentLength(a, b);
    if (len >= minLen) {
      bestIdx = i;
      bestLen = len;
      bestOri = o;
      break;
    }
  }

  // If we couldn't find a near-target segment in the preferred orientation, try any orientation.
  if (bestIdx < 0 && preferredOri) {
    for (let i = n - 2; i >= 0; i -= 1) {
      if (!eligible[i]) continue;
      const a = points[i];
      const b = points[i + 1];
      const o = segmentOrientation(a, b);
      if (o === 'd') continue;
      const len = segmentLength(a, b);
      if (len >= minLen) {
        bestIdx = i;
        bestLen = len;
        bestOri = o;
        break;
      }
    }
  }

  if (bestIdx < 0) {
    for (let i = 0; i < n - 1; i += 1) {
      if (!eligible[i]) continue;
      const a = points[i];
      const b = points[i + 1];
      const o = segmentOrientation(a, b);
      if (o === 'd') continue;
      const len = segmentLength(a, b);
      if (len > bestLen) {
        bestLen = len;
        bestIdx = i;
        bestOri = o;
      }
    }
  }

  if (bestIdx < 0 || bestOri === 'd') return null;

  // Corridor coordinate for this segment.
  const coord = bestOri === 'v' ? points[bestIdx].x : points[bestIdx].y;
  const axis: LaneAxis = bestOri === 'v' ? 'x' : 'y';

  // Extend corridor across adjacent collinear segments sharing the same coordinate.
  let startSeg = bestIdx;
  let endSeg = bestIdx;
  while (startSeg - 1 >= 0) {
    const o = segmentOrientation(points[startSeg - 1], points[startSeg]);
    if (o !== bestOri) break;
    const c = bestOri === 'v' ? points[startSeg - 1].x : points[startSeg - 1].y;
    if (!isNear(c, coord)) break;
    if (!eligible[startSeg - 1] && n >= 5) break;
    startSeg -= 1;
  }
  while (endSeg + 1 < n - 1) {
    const o = segmentOrientation(points[endSeg + 1], points[endSeg + 2]);
    if (o !== bestOri) break;
    const c = bestOri === 'v' ? points[endSeg + 1].x : points[endSeg + 1].y;
    if (!isNear(c, coord)) break;
    if (!eligible[endSeg + 1] && n >= 5) break;
    endSeg += 1;
  }

  // Indices of points that lie on the corridor (segment endpoints across the chain).
  const indices: number[] = [];
  for (let seg = startSeg; seg <= endSeg; seg += 1) {
    indices.push(seg, seg + 1);
  }

  const channel = quantize(coord, gs);
  const midOther =
    bestOri === 'v'
      ? quantize((points[bestIdx].y + points[bestIdx + 1].y) / 2, bandStep)
      : quantize((points[bestIdx].x + points[bestIdx + 1].x) / 2, bandStep);

  const targetSideKey = targetSide ?? '';
  const targetKey = it.targetKey ?? '';

  // Fan-in grouping: keep lanes stable when multiple connections approach the same target side.
  const key = `${targetKey}|${targetSideKey}|${axis}:${channel}:${midOther}`;

  // Lane ordering: sort by source coordinate (helps reduce crossings).
  const sortCoord = axis === 'x' ? points[0].y : points[0].x;

  return { key, axis, indices: uniqueIndices(indices, n), sortCoord };
}

/**
 * Applies cheap "lane" offsets for connections that share a similar corridor.
 * Returns a new array with updated points (does not mutate the input items).
 */
export function applyLaneOffsets(
  items: LaneOffsetItem[],
  opts?: { gridSize?: number; laneSpacing?: number; /** Approx stub length used near endpoints. */ stubLength?: number }
): LaneOffsetItem[] {
  const gridSize = opts?.gridSize;
  const laneSpacing = opts?.laneSpacing ?? Math.max(8, (gridSize ?? 20) / 2);

  const infos = new Map<string, LaneInfo>();
  const groups = new Map<string, LaneOffsetItem[]>();

  for (const it of items) {
    const info = laneInfoForPolyline(it, gridSize, { stubLength: opts?.stubLength });
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
    const sorted = [...groupItems].sort((a, b) => {
      const ai = infos.get(a.id);
      const bi = infos.get(b.id);
      const da = ai ? ai.sortCoord : 0;
      const db = bi ? bi.sortCoord : 0;
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
    const lanes = laneIndicesMonotonic(sorted.length);
    for (let i = 0; i < sorted.length; i += 1) {
      deltasById.set(sorted[i].id, lanes[i] * laneSpacing);
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
  /** Approx stub length used near endpoints (helps corridor detection). */
  stubLength?: number;
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
  const adjusted = applyLaneOffsets(items, { gridSize: opts?.gridSize, laneSpacing: opts?.laneSpacing, stubLength: opts?.stubLength });
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

