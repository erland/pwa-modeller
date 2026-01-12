import type { Point } from './geometry';

export type OrthogonalDirection = 'N' | 'E' | 'S' | 'W';

export type OrthogonalAStarObstacle = { x: number; y: number; w: number; h: number };

export type OrthogonalAStarBounds = {
  /** Inclusive min X in model coordinates. */
  minX: number;
  /** Inclusive min Y in model coordinates. */
  minY: number;
  /** Inclusive max X in model coordinates. */
  maxX: number;
  /** Inclusive max Y in model coordinates. */
  maxY: number;
};

export type OrthogonalAStarRouteOptions = {
  start: Point;
  end: Point;

  /** Routing grid size in model units. Must be > 0. */
  gridSize: number;

  /** Rectangles to avoid when routing (typically other nodes). */
  obstacles?: OrthogonalAStarObstacle[];

  /** Additional margin around obstacles (in model units). Defaults to gridSize / 2. */
  obstacleMargin?: number;

  /** Optional explicit routing bounds. If omitted, bounds are derived from start/end/obstacles + padding. */
  bounds?: OrthogonalAStarBounds;

  /** Penalize direction changes. Defaults to 5. */
  bendPenalty?: number;

  /** Constrain the first segment direction out of start. */
  startDir?: OrthogonalDirection;

  /** Constrain the last segment direction into end. */
  endDir?: OrthogonalDirection;

  /** Hard limit on expanded nodes to avoid runaway work in pathological cases. Defaults to 50_000. */
  maxExpansions?: number;
};

export type OrthogonalAStarRouteStatus = 'found' | 'fallback';

export type OrthogonalAStarRouteResult = {
  points: Point[];
  /** Whether a valid path to the goal was found, or we returned a simple fallback. */
  status: OrthogonalAStarRouteStatus;
};

type DirState = OrthogonalDirection | 'NONE';

type GridPoint = { gx: number; gy: number };

type NodeKey = string;

function keyFor(gx: number, gy: number, dir: DirState): NodeKey {
  return `${gx},${gy},${dir}`;
}

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize);
}

function gridToModel(g: number, gridSize: number): number {
  return g * gridSize;
}

function inflateRect(r: OrthogonalAStarObstacle, margin: number): OrthogonalAStarObstacle {
  if (!margin) return r;
  return { x: r.x - margin, y: r.y - margin, w: r.w + margin * 2, h: r.h + margin * 2 };
}

function pointInRect(p: Point, r: OrthogonalAStarObstacle): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function manhattanHeuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy);
}

function dirDelta(dir: OrthogonalDirection): { dx: number; dy: number } {
  switch (dir) {
    case 'N':
      return { dx: 0, dy: -1 };
    case 'S':
      return { dx: 0, dy: 1 };
    case 'E':
      return { dx: 1, dy: 0 };
    case 'W':
      return { dx: -1, dy: 0 };
  }
}

/**
 * Small deterministic priority queue.
 *
 * Order is by (f, then g, then seq). seq is insertion order to ensure stable tie-breaking.
 */
class MinHeap<T> {
  private data: Array<{ item: T; f: number; g: number; seq: number }> = [];
  private seq = 0;

  push(item: T, f: number, g: number): void {
    const node = { item, f, g, seq: this.seq++ };
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | null {
    if (this.data.length === 0) return null;
    const root = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return root.item;
  }

  get size(): number {
    return this.data.length;
  }

  private less(i: number, j: number): boolean {
    const a = this.data[i];
    const b = this.data[j];
    if (a.f !== b.f) return a.f < b.f;
    if (a.g !== b.g) return a.g < b.g;
    return a.seq < b.seq;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (!this.less(i, p)) break;
      [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
      i = p;
    }
  }

  private bubbleDown(i: number): void {
    for (;;) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let best = i;
      if (l < this.data.length && this.less(l, best)) best = l;
      if (r < this.data.length && this.less(r, best)) best = r;
      if (best === i) break;
      [this.data[i], this.data[best]] = [this.data[best], this.data[i]];
      i = best;
    }
  }
}

function defaultBounds(start: Point, end: Point, obstacles: OrthogonalAStarObstacle[], pad: number): OrthogonalAStarBounds {
  let minX = Math.min(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxX = Math.max(start.x, end.x);
  let maxY = Math.max(start.y, end.y);
  for (const o of obstacles) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.w);
    maxY = Math.max(maxY, o.y + o.h);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function simplifyOrthogonal(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    // Remove duplicates.
    if (abx === 0 && aby === 0) continue;
    // Remove collinear.
    if ((abx === 0 && bcx === 0) || (aby === 0 && bcy === 0)) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function isBlocked(
  gx: number,
  gy: number,
  gridSize: number,
  inflatedObstacles: OrthogonalAStarObstacle[],
  startG: GridPoint,
  endG: GridPoint
): boolean {
  if ((gx === startG.gx && gy === startG.gy) || (gx === endG.gx && gy === endG.gy)) return false;
  const p: Point = { x: gridToModel(gx, gridSize), y: gridToModel(gy, gridSize) };
  for (const o of inflatedObstacles) {
    if (pointInRect(p, o)) return true;
  }
  return false;
}

/**
 * Route an orthogonal path on a grid using A*.
 *
 * This is intentionally a self-contained module so it can be introduced and tested
 * independently before wiring into the existing `connectionPath.ts` routing pipeline.
 */
export function routeOrthogonalAStarDetailed(opts: OrthogonalAStarRouteOptions): OrthogonalAStarRouteResult {
  const gridSize = opts.gridSize;
  if (!Number.isFinite(gridSize) || gridSize <= 0) throw new Error('gridSize must be a positive finite number');

  const obstacles = opts.obstacles ?? [];
  const margin = opts.obstacleMargin ?? gridSize / 2;
  const inflated = obstacles.map((o) => inflateRect(o, margin));

  // Bounds in model coords, then snapped to grid.
  const pad = gridSize * 10;
  const b = opts.bounds ?? defaultBounds(opts.start, opts.end, inflated, pad);
  const minGX = snapToGrid(b.minX, gridSize);
  const minGY = snapToGrid(b.minY, gridSize);
  const maxGX = snapToGrid(b.maxX, gridSize);
  const maxGY = snapToGrid(b.maxY, gridSize);

  const startG: GridPoint = { gx: snapToGrid(opts.start.x, gridSize), gy: snapToGrid(opts.start.y, gridSize) };
  const endG: GridPoint = { gx: snapToGrid(opts.end.x, gridSize), gy: snapToGrid(opts.end.y, gridSize) };

  const bendPenalty = opts.bendPenalty ?? 5;
  const maxExpansions = opts.maxExpansions ?? 50_000;

  type State = { gx: number; gy: number; dir: DirState };
  type CameFrom = { prevKey: NodeKey; prev: State };

  const open = new MinHeap<State>();
  const gScore = new Map<NodeKey, number>();
  const cameFrom = new Map<NodeKey, CameFrom>();

  const startState: State = { gx: startG.gx, gy: startG.gy, dir: 'NONE' };
  const startKey = keyFor(startState.gx, startState.gy, startState.dir);
  gScore.set(startKey, 0);
  open.push(startState, manhattanHeuristic(startG, endG), 0);

  // Stable neighbor order. (This matters for determinism when costs tie.)
  const neighborDirs: OrthogonalDirection[] = ['E', 'S', 'W', 'N'];

  let expansions = 0;
  let bestGoalKey: NodeKey | null = null;
  let bestGoalG = Number.POSITIVE_INFINITY;

  while (open.size > 0) {
    const cur = open.pop()!;
    const curKey = keyFor(cur.gx, cur.gy, cur.dir);
    const curG = gScore.get(curKey);
    if (curG === undefined) continue;

    // If we have already found a better goal, we can stop once the current best f cannot beat it.
    const curH = manhattanHeuristic({ gx: cur.gx, gy: cur.gy }, endG);
    if (bestGoalKey && curG + curH >= bestGoalG) break;

    expansions += 1;
    if (expansions > maxExpansions) break;

    if (cur.gx === endG.gx && cur.gy === endG.gy) {
      // Enforce terminal direction constraint if requested.
      if (opts.endDir && cur.dir !== opts.endDir) {
        // Not acceptable as goal.
      } else if (curG < bestGoalG) {
        bestGoalG = curG;
        bestGoalKey = curKey;
      }
      // Continue search: there might be another way to reach end with smaller g
      // (due to direction dimension), but the early-exit above will stop us safely.
    }

    for (const nd of neighborDirs) {
      // Enforce start direction constraint on the first move.
      if (opts.startDir && cur.dir === 'NONE' && nd !== opts.startDir) continue;

      const d = dirDelta(nd);
      const nx = cur.gx + d.dx;
      const ny = cur.gy + d.dy;
      if (nx < minGX || nx > maxGX || ny < minGY || ny > maxGY) continue;
      if (isBlocked(nx, ny, gridSize, inflated, startG, endG)) continue;

      const nextDir: DirState = nd;
      const nextKey = keyFor(nx, ny, nextDir);

      const bendCost = cur.dir === 'NONE' || cur.dir === nd ? 0 : bendPenalty;
      const tentativeG = curG + 1 + bendCost;
      const prevBest = gScore.get(nextKey);
      if (prevBest !== undefined && tentativeG >= prevBest) continue;

      gScore.set(nextKey, tentativeG);
      cameFrom.set(nextKey, { prevKey: curKey, prev: cur });
      const h = manhattanHeuristic({ gx: nx, gy: ny }, endG);
      open.push({ gx: nx, gy: ny, dir: nextDir }, tentativeG + h, tentativeG);
    }
  }

  // Reconstruct.
  const goalKey = bestGoalKey;
  if (!goalKey) {
    // Fallback: return the simplest orthogonal L-route on the snapped grid.
    const a: Point = { x: gridToModel(startG.gx, gridSize), y: gridToModel(startG.gy, gridSize) };
    const c: Point = { x: a.x, y: gridToModel(endG.gy, gridSize) };
    const points = simplifyOrthogonal([opts.start, c, opts.end]).map((p, idx, arr) => {
      // Ensure endpoints are exact.
      if (idx === 0) return opts.start;
      if (idx === arr.length - 1) return opts.end;
      return p;
    });
    return { points, status: 'fallback' };
  }

  const states: State[] = [];
  let k: NodeKey | null = goalKey;
  while (k) {
    const [sx, sy, sdir] = k.split(',');
    states.push({ gx: Number(sx), gy: Number(sy), dir: (sdir as DirState) ?? 'NONE' });
    const prev = cameFrom.get(k);
    k = prev ? prev.prevKey : null;
  }
  states.reverse();

  const points: Point[] = states.map((s) => ({ x: gridToModel(s.gx, gridSize), y: gridToModel(s.gy, gridSize) }));
  const simplified = simplifyOrthogonal(points);

  // Preserve exact endpoints if inputs were not exactly on-grid.
  if (simplified.length >= 1) simplified[0] = opts.start;
  if (simplified.length >= 2) simplified[simplified.length - 1] = opts.end;

  return { points: simplified, status: 'found' };
}

export function routeOrthogonalAStar(opts: OrthogonalAStarRouteOptions): Point[] {
  return routeOrthogonalAStarDetailed(opts).points;
}
