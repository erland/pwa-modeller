import { clamp, type Point } from './geometry';

/** Which side of the target node a connection approaches. */
export type FanInSide = 'left' | 'right' | 'top' | 'bottom';

export type Rect = { x: number; y: number; w: number; h: number };

export type FanInConnection = {
  /** Unique id (typically ViewConnection id). */
  id: string;
  /** The view the connection belongs to. */
  viewId: string;
  /** Key identifying the target node/connectable (e.g. `${kind}:${id}`). */
  targetKey: string;
  /** Existing polyline points (usually already snapped and stubbed). */
  points: Point[];
  /** Target rect in model coordinates. */
  targetRect: Rect;
  /** Optional explicit side; if omitted it is inferred from the last segment direction. */
  targetSide?: FanInSide;
};

export type FanInRoutingOptions = {
  gridSize?: number;
  /** Distance from target edge to place the shared approach line. Defaults to 2*gridSize. */
  approachGap?: number;
  /** Lane spacing used to separate fan-in lines on the approach corridor. Defaults to gridSize/2. */
  laneSpacing?: number;
  /** Minimum spacing between dock points along the target side. Defaults to gridSize/2. */
  dockSpacing?: number;
  /** Padding inside the target edge where docking is allowed. Defaults to gridSize/3. */
  dockPadding?: number;
  /** Outward stub length (used to build the last segment into the dock anchor). Defaults to max(6, gridSize/2). */
  stubLength?: number;
  /** Optional obstacles to avoid for the approach corridor (inflated by obstacleMargin). */
  obstacles?: Rect[];
  obstacleMargin?: number;
  /** Maximum number of shift steps when trying to avoid obstacles. Defaults to 10. */
  maxShiftSteps?: number;
};

function quantize(v: number, step: number): number {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

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

  // Fallback: bounding-box overlap.
  const xmin = Math.min(a.x, b.x);
  const xmax = Math.max(a.x, b.x);
  const ymin = Math.min(a.y, b.y);
  const ymax = Math.max(a.y, b.y);
  return xmax >= x0 && xmin <= x1 && ymax >= y0 && ymin <= y1;
}

function polylineIntersectsAnyRect(
  points: Point[],
  obstacles: Rect[],
  margin: number,
  opts?: { ignoreFirstSegments?: number; ignoreLastSegments?: number }
): boolean {
  if (!obstacles.length || points.length < 2) return false;
  const inflated = obstacles.map((o) => inflateRect(o, margin));
  const ignoreFirst = opts?.ignoreFirstSegments ?? 0;
  const ignoreLast = opts?.ignoreLastSegments ?? 0;
  const lastSegIndexExclusive = Math.max(0, points.length - 1 - ignoreLast);

  for (let i = 0; i < points.length - 1; i += 1) {
    if (i < ignoreFirst) continue;
    if (i >= lastSegIndexExclusive) continue;

    const a = points[i];
    const b = points[i + 1];
    for (const r of inflated) {
      if (segmentIntersectsRect(a, b, r)) return true;
    }
  }
  return false;
}

/**
 * Infer approach side from the last segment direction.
 * Semantics:
 * - Last segment moves right => target is approached from the left.
 * - Last segment moves left  => target is approached from the right.
 * - Last segment moves down  => target is approached from the top.
 * - Last segment moves up    => target is approached from the bottom.
 */
export function inferTargetSideFromPoints(points: Point[]): FanInSide | undefined {
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

function firstNonAnchorPoint(points: Point[]): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  return points[1];
}

function groupKey(viewId: string, targetKey: string, side: FanInSide): string {
  return `${viewId}::${targetKey}::${side}`;
}

function outwardSignForSide(side: FanInSide): number {
  // Sign for the approach coordinate shift direction (outward from the target).
  if (side === 'left' || side === 'top') return -1;
  return +1;
}

function laneIndicesOutward(count: number, side: FanInSide): number[] {
  // Outward-only lanes: 0, 1, 2, ... then apply sign.
  const sign = outwardSignForSide(side);
  return Array.from({ length: count }, (_, i) => i * sign);
}

type DockAssignment = { dockCoord: number; orderCoord: number; conn: FanInConnection };

function assignDocks1D(assignments: DockAssignment[], min: number, max: number, spacing: number): Map<string, number> {
  const res = new Map<string, number>();
  if (assignments.length === 0) return res;

  const ordered = assignments.slice().sort((a, b) => a.orderCoord - b.orderCoord);
  const docks: number[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const desired = clamp(ordered[i].dockCoord, min, max);
    const prev = i === 0 ? -Infinity : docks[i - 1];
    docks[i] = Math.max(desired, prev + spacing);
  }
  // If we overflow the max, shift everything back while preserving spacing.
  const overflow = docks[docks.length - 1] - max;
  if (overflow > 0) {
    for (let i = 0; i < docks.length; i += 1) docks[i] -= overflow;
    // Clamp again (can violate min slightly if too many docks, but keep monotonic).
    for (let i = 0; i < docks.length; i += 1) docks[i] = clamp(docks[i], min, max);
    for (let i = 1; i < docks.length; i += 1) docks[i] = Math.max(docks[i], docks[i - 1] + spacing);
  }

  for (let i = 0; i < ordered.length; i += 1) {
    res.set(ordered[i].conn.id, docks[i]);
  }
  return res;
}

function buildTargetDockPoints(side: FanInSide, targetRect: Rect, dockCoord: number, stubLength: number): { entryStub: Point; anchor: Point } {
  const left = targetRect.x;
  const right = targetRect.x + targetRect.w;
  const top = targetRect.y;
  const bottom = targetRect.y + targetRect.h;

  if (side === 'left') {
    const anchor = { x: left, y: dockCoord };
    const entryStub = { x: left - stubLength, y: dockCoord };
    return { entryStub, anchor };
  }
  if (side === 'right') {
    const anchor = { x: right, y: dockCoord };
    const entryStub = { x: right + stubLength, y: dockCoord };
    return { entryStub, anchor };
  }
  if (side === 'top') {
    const anchor = { x: dockCoord, y: top };
    const entryStub = { x: dockCoord, y: top - stubLength };
    return { entryStub, anchor };
  }
  // bottom
  const anchor = { x: dockCoord, y: bottom };
  const entryStub = { x: dockCoord, y: bottom + stubLength };
  return { entryStub, anchor };
}

function removeRedundant(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice();
  // Dedup.
  const deduped: Point[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    const prev = deduped[deduped.length - 1];
    if (p.x === prev.x && p.y === prev.y) continue;
    deduped.push(p);
  }
  if (deduped.length <= 2) return deduped;

  // Remove collinear.
  const out: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const abH = a.y === b.y;
    const bcH = b.y === c.y;
    const abV = a.x === b.x;
    const bcV = b.x === c.x;
    if ((abH && bcH) || (abV && bcV)) continue;
    out.push(b);
  }
  out.push(deduped[deduped.length - 1]);
  return out;
}

function computeFanInForGroup(group: FanInConnection[], side: FanInSide, opts: Required<FanInRoutingOptions>): Map<string, Point[]> {
  const res = new Map<string, Point[]>();
  if (group.length < 2) return res;

  const gs = opts.gridSize;
  const padding = opts.dockPadding;
  const spacing = opts.dockSpacing;

  // Order by source Y/X depending on the side to keep routing monotonic.
  const orderBy: DockAssignment[] = group.map((c) => {
    const start = firstNonAnchorPoint(c.points);
    const orderCoord = side === 'left' || side === 'right' ? start.y : start.x;
    const desiredDock = side === 'left' || side === 'right' ? c.points[c.points.length - 1]?.y ?? start.y : c.points[c.points.length - 1]?.x ?? start.x;
    return {
      dockCoord: desiredDock,
      orderCoord,
      conn: c,
    };
  });

  const tr = group[0].targetRect;
  const dockMin = side === 'left' || side === 'right' ? tr.y + padding : tr.x + padding;
  const dockMax = side === 'left' || side === 'right' ? tr.y + tr.h - padding : tr.x + tr.w - padding;
  const dockMap = assignDocks1D(orderBy, dockMin, dockMax, spacing);

  // Shared approach coordinate base.
  const approachGap = opts.approachGap;
  const approachBase =
    side === 'left'
      ? tr.x - approachGap
      : side === 'right'
        ? tr.x + tr.w + approachGap
        : side === 'top'
          ? tr.y - approachGap
          : tr.y + tr.h + approachGap;

  const laneIndices = laneIndicesOutward(group.length, side);
  const laneSpacing = opts.laneSpacing;
  const maxShiftSteps = opts.maxShiftSteps;
  const shiftSign = outwardSignForSide(side);

  // Stable order for lane assignment: use the same ordering as dock assignment.
  const orderedGroup = orderBy.slice().sort((a, b) => a.orderCoord - b.orderCoord).map((x) => x.conn);

  for (let idx = 0; idx < orderedGroup.length; idx += 1) {
    const c = orderedGroup[idx];
    const dockCoord = dockMap.get(c.id);
    if (dockCoord === undefined) continue;

    const stubLength = opts.stubLength;
    const { entryStub, anchor } = buildTargetDockPoints(side, c.targetRect, dockCoord, stubLength);

    const startAnchor = c.points[0] ?? { x: 0, y: 0 };
    const startExit = firstNonAnchorPoint(c.points);

    // Add an extra outward point based on the direction of the source stub.
    // This prevents cases where the approach corridor aligns with startExit and the route
    // immediately turns into a trunk that hugs the source edge (appearing "behind" the node).
    const sdx = startExit.x - startAnchor.x;
    const sdy = startExit.y - startAnchor.y;
    const extra = opts.stubLength;
    let startOut: Point = startExit;
    if (Math.abs(sdx) >= Math.abs(sdy)) {
      const sign = sdx === 0 ? 0 : Math.sign(sdx);
      if (sign !== 0) startOut = { x: startExit.x + sign * extra, y: startExit.y };
    } else {
      const sign = sdy === 0 ? 0 : Math.sign(sdy);
      if (sign !== 0) startOut = { x: startExit.x, y: startExit.y + sign * extra };
    }

    // Lane offset applied to the approach line.
    const laneOffset = laneIndices[idx] * laneSpacing;
    const laneQuant = Math.max(1, laneSpacing);
    const approachLane0 = quantize(approachBase + laneOffset, laneQuant);

    // Candidate search for a collision-free approach line by shifting outward.
    let approachLane = approachLane0;
    if (opts.obstacles.length) {
      for (let s = 0; s <= maxShiftSteps; s += 1) {
        const candidate = quantize(approachLane0 + shiftSign * s * gs, laneQuant);
        const candidatePoints = buildFanInPolyline(side, startAnchor, startExit, startOut, candidate, entryStub, anchor);
        // Ignore the first two segments (source exit stub) so the source node can be included
        // as an obstacle for the rest of the route without poisoning the search.
        if (!polylineIntersectsAnyRect(candidatePoints, opts.obstacles, opts.obstacleMargin, { ignoreFirstSegments: 2, ignoreLastSegments: 1 })) {
          approachLane = candidate;
          break;
        }
        // Keep the last tried value if none found.
        approachLane = candidate;
      }
    }

    const routed = buildFanInPolyline(side, startAnchor, startExit, startOut, approachLane, entryStub, anchor);
    res.set(c.id, removeRedundant(routed));
  }

  return res;
}

function buildFanInPolyline(
  side: FanInSide,
  startAnchor: Point,
  startExit: Point,
  startOut: Point,
  approachCoord: number,
  targetEntryStub: Point,
  targetAnchor: Point
): Point[] {
  // Note: startAnchor->startExit is expected to be a stub leaving the source.
  // We add an extra outward point (startOut) to ensure the path doesn't immediately
  // collapse into a vertical/horizontal trunk that hugs the source edge.
  // We route from startOut to an approach line, then to a docked target entry stub.
  if (side === 'left' || side === 'right') {
    const p1 = { x: approachCoord, y: startOut.y };
    const p2 = { x: approachCoord, y: targetEntryStub.y };
    const p3 = { x: targetEntryStub.x, y: targetEntryStub.y };
    return [startAnchor, startExit, startOut, p1, p2, p3, targetAnchor];
  }
  // top/bottom
  const p1 = { x: startOut.x, y: approachCoord };
  const p2 = { x: targetEntryStub.x, y: approachCoord };
  const p3 = { x: targetEntryStub.x, y: targetEntryStub.y };
  return [startAnchor, startExit, startOut, p1, p2, p3, targetAnchor];
}

/**
 * Compute fan-in reroutes for orthogonal connections.
 *
 * Returns a map of connectionId -> new polyline points for those connections that were rerouted.
 * Connections not present in the returned map should keep their original points.
 */
export function computeFanInPolylines(connections: FanInConnection[], options?: FanInRoutingOptions): Map<string, Point[]> {
  const gs = options?.gridSize ?? 20;
  const opts: Required<FanInRoutingOptions> = {
    gridSize: gs,
    approachGap: options?.approachGap ?? gs * 2,
    laneSpacing: options?.laneSpacing ?? gs / 2,
    dockSpacing: options?.dockSpacing ?? gs / 2,
    dockPadding: options?.dockPadding ?? gs / 3,
    stubLength: options?.stubLength ?? Math.max(6, gs / 2),
    obstacles: options?.obstacles ?? [],
    obstacleMargin: options?.obstacleMargin ?? gs / 2,
    maxShiftSteps: options?.maxShiftSteps ?? 10,
  };

  const byGroup = new Map<string, FanInConnection[]>();
  for (const c of connections) {
    if (!c.points || c.points.length < 2) continue;
    const side = c.targetSide ?? inferTargetSideFromPoints(c.points);
    if (!side) continue;
    const k = groupKey(c.viewId, c.targetKey, side);
    const arr = byGroup.get(k);
    if (arr) arr.push({ ...c, targetSide: side });
    else byGroup.set(k, [{ ...c, targetSide: side }]);
  }

  const out = new Map<string, Point[]>();
  for (const [k, group] of byGroup) {
    if (group.length < 2) continue;
    // Side is encoded in the key.
    const parts = k.split('::');
    const side = parts[2] as FanInSide;
    const reroutes = computeFanInForGroup(group, side, opts);
    for (const [id, pts] of reroutes) out.set(id, pts);
  }
  return out;
}
