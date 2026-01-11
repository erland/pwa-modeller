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
