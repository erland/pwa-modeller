import type { Point } from './geometry';

export type Side = 'left' | 'right' | 'top' | 'bottom';

export type Rect = { x: number; y: number; w: number; h: number };

export type OrthogonalRoute = {
  points: Point[];
  sourceSide: Side;
  targetSide: Side;
  bends: number;
  length: number;
};

export type OrthogonalPathfinderOptions = {
  /** Grid size used for quantization and padding. */
  gridSize: number;
  /** How far to keep paths away from nodes/obstacles (inflation radius). */
  clearance: number;
  /** Length of the exit/entry stub from the node border. */
  stubLength: number;
  /** Maximum number of shift steps used when adding "around-edge" coordinates. */
  coordPaddingSteps?: number;
};

type Dir = 0 | 1 | 2; // 0=none, 1=horizontal, 2=vertical

function rectLeft(r: Rect): number {
  return r.x;
}
function rectRight(r: Rect): number {
  return r.x + r.w;
}
function rectTop(r: Rect): number {
  return r.y;
}
function rectBottom(r: Rect): number {
  return r.y + r.h;
}

function inflateRect(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function uniqSorted(vals: number[], eps = 1e-6): number[] {
  const arr = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of arr) {
    if (out.length === 0 || Math.abs(out[out.length - 1] - v) > eps) out.push(v);
  }
  return out;
}

function quantize(v: number, q: number): number {
  if (q <= 0) return v;
  return Math.round(v / q) * q;
}

function pointInsideRect(p: Point, r: Rect): boolean {
  // Treat boundary as inside to keep clearance robust.
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  // Only supports axis-aligned segments.
  if (a.x === b.x) {
    const x = a.x;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    if (x < r.x || x > r.x + r.w) return false;
    return y2 >= r.y && y1 <= r.y + r.h;
  }
  if (a.y === b.y) {
    const y = a.y;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    if (y < r.y || y > r.y + r.h) return false;
    return x2 >= r.x && x1 <= r.x + r.w;
  }
  // Not orthogonal.
  return false;
}

function polylineIntersectsAnyObstacle(points: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (const o of obstacles) {
      if (segmentIntersectsRect(a, b, o)) return true;
    }
  }
  return false;
}

function sideAxis(side: Side): Dir {
  return side === 'left' || side === 'right' ? 1 : 2;
}

function sideDirVec(side: Side): Point {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

function anchorOnRect(r: Rect, side: Side, align: number, padding: number): Point {
  const left = rectLeft(r);
  const right = rectRight(r);
  const top = rectTop(r);
  const bottom = rectBottom(r);

  if (side === 'left' || side === 'right') {
    const y = clamp(align, top + padding, bottom - padding);
    return { x: side === 'left' ? left : right, y };
  }
  const x = clamp(align, left + padding, right - padding);
  return { x, y: side === 'top' ? top : bottom };
}

function manhattanPathLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    len += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  }
  return len;
}

function countBends(points: Point[], startDir: Dir): number {
  let bends = 0;
  let dir: Dir = startDir;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const ndir: Dir = a.x === b.x ? 2 : 1;
    if (dir !== 0 && ndir !== dir) bends += 1;
    dir = ndir;
  }
  return bends;
}

class MinHeap<T> {
  private a: Array<{ k: [number, number]; v: T }> = [];
  private less(i: number, j: number): boolean {
    const ki = this.a[i].k;
    const kj = this.a[j].k;
    return ki[0] < kj[0] || (ki[0] === kj[0] && ki[1] < kj[1]);
  }
  push(k: [number, number], v: T): void {
    this.a.push({ k, v });
    this.bubbleUp(this.a.length - 1);
  }
  pop(): { k: [number, number]; v: T } | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }
  get size(): number {
    return this.a.length;
  }
  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (!this.less(i, p)) break;
      const tmp = this.a[i];
      this.a[i] = this.a[p];
      this.a[p] = tmp;
      i = p;
    }
  }
  private bubbleDown(i: number): void {
    for (;;) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let m = i;
      if (l < this.a.length && this.less(l, m)) m = l;
      if (r < this.a.length && this.less(r, m)) m = r;
      if (m === i) break;
      const tmp = this.a[i];
      this.a[i] = this.a[m];
      this.a[m] = tmp;
      i = m;
    }
  }
}

type GraphNode = { id: number; p: Point };
type Edge = { to: number; dir: Dir; dist: number; soft: number };

function buildSparseGridGraph(pointsOfInterest: Point[], obstacles: Rect[], gridSize: number, paddingSteps: number, softObstacles?: Rect[], softPenalty: number = 0): { nodes: GraphNode[]; edges: Edge[][]; nodeIdByXY: Map<string, number> } {
  const xs: number[] = [];
  const ys: number[] = [];
  const pad = gridSize;

  for (const p of pointsOfInterest) {
    xs.push(p.x, p.x - pad, p.x + pad);
    ys.push(p.y, p.y - pad, p.y + pad);
  }
  for (const o of obstacles) {
    const l = o.x;
    const r = o.x + o.w;
    const t = o.y;
    const b = o.y + o.h;
    for (let k = 0; k <= paddingSteps; k += 1) {
      const d = k * gridSize;
      xs.push(l - d, r + d);
      ys.push(t - d, b + d);
    }
  }

  const ux = uniqSorted(xs.map((v) => quantize(v, gridSize)));
  const uy = uniqSorted(ys.map((v) => quantize(v, gridSize)));

  const nodes: GraphNode[] = [];
  const nodeIdByXY = new Map<string, number>();

  for (const y of uy) {
    for (const x of ux) {
      const p = { x, y };
      let ok = true;
      for (const o of obstacles) {
        if (pointInsideRect(p, o)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const id = nodes.length;
      nodes.push({ id, p });
      nodeIdByXY.set(`${x},${y}`, id);
    }
  }

  const edges: Edge[][] = Array.from({ length: nodes.length }, () => []);

  const softHit = (a: Point, b: Point): boolean => {
    if (!softObstacles || softObstacles.length === 0 || softPenalty <= 0) return false;
    for (const o of softObstacles) {
      if (segmentIntersectsRect(a, b, o)) return true;
    }
    return false;
  };

  // Horizontal neighbors (same y).
  const byY = new Map<number, Array<{ x: number; id: number }>>();
  for (const n of nodes) {
    const row = byY.get(n.p.y) ?? [];
    row.push({ x: n.p.x, id: n.id });
    byY.set(n.p.y, row);
  }
  for (const row of byY.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i += 1) {
      const a = nodes[row[i].id].p;
      const b = nodes[row[i + 1].id].p;
      let blocked = false;
      for (const o of obstacles) {
        if (segmentIntersectsRect(a, b, o)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        const dist = Math.abs(b.x - a.x);
        edges[row[i].id].push({ to: row[i + 1].id, dir: 1, dist, soft: softHit(a, b) ? softPenalty : 0 });
        edges[row[i + 1].id].push({ to: row[i].id, dir: 1, dist, soft: softHit(a, b) ? softPenalty : 0 });
      }
    }
  }

  // Vertical neighbors (same x).
  const byX = new Map<number, Array<{ y: number; id: number }>>();
  for (const n of nodes) {
    const col = byX.get(n.p.x) ?? [];
    col.push({ y: n.p.y, id: n.id });
    byX.set(n.p.x, col);
  }
  for (const col of byX.values()) {
    col.sort((a, b) => a.y - b.y);
    for (let i = 0; i < col.length - 1; i += 1) {
      const a = nodes[col[i].id].p;
      const b = nodes[col[i + 1].id].p;
      let blocked = false;
      for (const o of obstacles) {
        if (segmentIntersectsRect(a, b, o)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        const dist = Math.abs(b.y - a.y);
        edges[col[i].id].push({ to: col[i + 1].id, dir: 2, dist, soft: softHit(a, b) ? softPenalty : 0 });
        edges[col[i + 1].id].push({ to: col[i].id, dir: 2, dist, soft: softHit(a, b) ? softPenalty : 0 });
      }
    }
  }

  return { nodes, edges, nodeIdByXY };
}

function dijkstraLex(
  nodes: GraphNode[],
  edges: Edge[][],
  startId: number,
  startDir: Dir,
): { bends: number[]; length: number[]; prev: Array<number | null>; prevDir: Dir[] } {
  const N = nodes.length;
  const INF = 1e15;

  // State is (nodeId, dir) packed to idx = nodeId*3 + dir.
  const S = N * 3;
  const bends = new Array<number>(S).fill(INF);
  const length = new Array<number>(S).fill(INF);
  const prev = new Array<number | null>(S).fill(null);
  const prevDir = new Array<Dir>(S).fill(0);

  const startIdx = startId * 3 + startDir;
  bends[startIdx] = 0;
  length[startIdx] = 0;

  const heap = new MinHeap<number>();
  heap.push([0, 0], startIdx);

  while (heap.size > 0) {
    const cur = heap.pop()!;
    const sIdx = cur.v;
    const b0 = bends[sIdx];
    const l0 = length[sIdx];
    if (cur.k[0] !== b0 || cur.k[1] !== l0) continue;

    const nodeId = Math.floor(sIdx / 3);
    const dir0 = (sIdx % 3) as Dir;

    for (const e of edges[nodeId]) {
      const ndir = e.dir;
      const nb = b0 + (dir0 !== 0 && ndir !== dir0 ? 1 : 0);
      const nl = l0 + e.dist + e.soft;
      const nIdx = e.to * 3 + ndir;

      const better = nb < bends[nIdx] || (nb === bends[nIdx] && nl < length[nIdx]);
      if (better) {
        bends[nIdx] = nb;
        length[nIdx] = nl;
        prev[nIdx] = sIdx;
        prevDir[nIdx] = dir0;
        heap.push([nb, nl], nIdx);
      }
    }
  }

  return { bends, length, prev, prevDir };
}

function reconstructPath(nodes: GraphNode[], prev: Array<number | null>, endIdx: number): Point[] {
  const rev: Point[] = [];
  let cur: number | null = endIdx;
  while (cur != null) {
    const nodeId = Math.floor(cur / 3);
    rev.push(nodes[nodeId].p);
    cur = prev[cur];
  }
  rev.reverse();
  // Remove collinear duplicates
  const out: Point[] = [];
  for (const p of rev) {
    if (out.length === 0) out.push(p);
    else {
      const last = out[out.length - 1];
      if (last.x !== p.x || last.y !== p.y) out.push(p);
    }
  }
  // Remove collinear middle points
  const simp: Point[] = [];
  for (const p of out) {
    simp.push(p);
    while (simp.length >= 3) {
      const a = simp[simp.length - 3];
      const b = simp[simp.length - 2];
      const c = simp[simp.length - 1];
      const col = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (col) simp.splice(simp.length - 2, 1);
      else break;
    }
  }
  return simp;
}

function sidePairs(): Array<[Side, Side]> {
  const sides: Side[] = ['left', 'right', 'top', 'bottom'];
  const pairs: Array<[Side, Side]> = [];
  for (const a of sides) for (const b of sides) pairs.push([a, b]);
  return pairs;
}

/**
 * Find a rectilinear route between two rectangles using a sparse grid + Dijkstra.
 *
 * This is a "full" obstacle-avoiding router that prioritizes:
 *  1) fewest bends
 *  2) shortest length
 *
 * It chooses the best source/target side automatically (tries all 16 pairs).
 */
export function findBestOrthogonalRouteBetweenRects(params: {
  sourceRect: Rect;
  targetRect: Rect;
  obstacles: Rect[];
  options: OrthogonalPathfinderOptions;
  softObstacles?: Rect[];
  softPenalty?: number;
}): OrthogonalRoute | null {
  const { sourceRect, targetRect, obstacles, options } = params;
  const { gridSize, clearance, stubLength, coordPaddingSteps = 1 } = options;

  const padding = Math.max(4, Math.min(12, Math.floor(gridSize / 2)));

  // Inflate obstacles for clearance, but do NOT include source/target in obstacles list here.
  const inflatedObs = obstacles.map((o) => inflateRect(o, clearance));

  const srcCenter = { x: sourceRect.x + sourceRect.w / 2, y: sourceRect.y + sourceRect.h / 2 };
  const tgtCenter = { x: targetRect.x + targetRect.w / 2, y: targetRect.y + targetRect.h / 2 };

  let best: OrthogonalRoute | null = null;

  for (const [sSide, tSide] of sidePairs()) {
    const sAnchor = anchorOnRect(sourceRect, sSide, sSide === 'left' || sSide === 'right' ? tgtCenter.y : tgtCenter.x, padding);
    const tAnchor = anchorOnRect(targetRect, tSide, tSide === 'left' || tSide === 'right' ? srcCenter.y : srcCenter.x, padding);

    const sVec = sideDirVec(sSide);
    const tVec = sideDirVec(tSide);

    const sStub = { x: sAnchor.x + sVec.x * stubLength, y: sAnchor.y + sVec.y * stubLength };
    const tStub = { x: tAnchor.x + tVec.x * stubLength, y: tAnchor.y + tVec.y * stubLength };

    // Points of interest include stubs + obstacle edges.
    const poi: Point[] = [sStub, tStub, sAnchor, tAnchor];

    // Add inflated source/target as obstacles too (to prevent paths from re-entering), but allow stubs that start outside.
    const inflatedSrc = inflateRect(sourceRect, clearance);
    const inflatedTgt = inflateRect(targetRect, clearance);
    const allObs = [...inflatedObs, inflatedSrc, inflatedTgt];

    // Ensure stubs are not inside obstacles; if they are, skip this side pair.
    if (allObs.some((o) => pointInsideRect(sStub, o) || pointInsideRect(tStub, o))) continue;

    const { nodes, edges, nodeIdByXY } = buildSparseGridGraph(
      poi,
      allObs,
      gridSize,
      coordPaddingSteps,
      params.softObstacles,
      params.softPenalty ?? 0
    );

    const sid = nodeIdByXY.get(`${quantize(sStub.x, gridSize)},${quantize(sStub.y, gridSize)}`);
    const tid = nodeIdByXY.get(`${quantize(tStub.x, gridSize)},${quantize(tStub.y, gridSize)}`);
    if (sid == null || tid == null) continue;

    const sAxis = sideAxis(sSide);
    const tAxis = sideAxis(tSide);

    const res = dijkstraLex(nodes, edges, sid, sAxis);

    // Choose best end state among dirs, but account for final segment from tStub to tAnchor.
    let bestEndIdx: number | null = null;
    let bestB = 1e15;
    let bestL = 1e15;

    for (const endDir of [1 as Dir, 2 as Dir, 0 as Dir]) {
      const idx = tid * 3 + endDir;
      if (!Number.isFinite(res.bends[idx]) || res.bends[idx] >= 1e15) continue;
      const extraBend = endDir !== 0 && endDir !== tAxis ? 1 : 0;
      const nb = res.bends[idx] + extraBend;
      const nl = res.length[idx] + (Math.abs(tAnchor.x - tStub.x) + Math.abs(tAnchor.y - tStub.y));
      const better = nb < bestB || (nb === bestB && nl < bestL);
      if (better) {
        bestB = nb;
        bestL = nl;
        bestEndIdx = idx;
      }
    }
    if (bestEndIdx == null) continue;

    const core = reconstructPath(nodes, res.prev, bestEndIdx);

    const full: Point[] = [sAnchor, sStub, ...core.slice(1, -1), tStub, tAnchor];
    // Sanity: must not intersect obstacles (excluding the source/target inflated rects touched by stubs).
    if (polylineIntersectsAnyObstacle(full, inflatedObs)) {
      // It is allowed to run near source/target, but shouldn't cut through other obstacles.
      continue;
    }

    const length = manhattanPathLength(full);
    const bends = countBends(full, sAxis);

    const candidate: OrthogonalRoute = { points: full, sourceSide: sSide, targetSide: tSide, bends, length };

    if (best == null || bends < best.bends || (bends === best.bends && length < best.length)) {
      best = candidate;
    }
  }

  return best;
}