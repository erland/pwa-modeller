import type { ViewNodeLayout } from '../../domain';
import type { Point } from './geometry';

type Rect = { x: number; y: number; w: number; h: number };
type Side = 'left' | 'right' | 'top' | 'bottom';

function nodeRect(n: ViewNodeLayout): Rect {
  const isConnector = Boolean((n as any).connectorId);
  const w = n.width ?? (isConnector ? 24 : 120);
  const h = n.height ?? (isConnector ? 24 : 60);
  return { x: n.x, y: n.y, w, h };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cornerPadForRect(r: Rect): number {
  // Keep connectors usable: don't pad more than a quarter of the size.
  const maxPad = Math.max(1, Math.min(r.w, r.h) / 4);
  return Math.min(10, maxPad);
}

function anchorOnRect(r: Rect, side: Side, coord: number): Point {
  const pad = cornerPadForRect(r);
  const left = r.x;
  const right = r.x + r.w;
  const top = r.y;
  const bottom = r.y + r.h;

  if (side === 'left') return { x: left, y: clamp(coord, top + pad, bottom - pad) };
  if (side === 'right') return { x: right, y: clamp(coord, top + pad, bottom - pad) };
  if (side === 'top') return { x: clamp(coord, left + pad, right - pad), y: top };
  return { x: clamp(coord, left + pad, right - pad), y: bottom };
}

/**
 * When the router decides to start (or end) with a different axis than the initially chosen
 * rectEdgeAnchor, the connection can look odd (e.g. a horizontal segment that starts from the
 * top edge of the node).
 *
 * This helper "snaps" the first and last points of an **orthogonal** polyline to the node edge
 * implied by the first/last segment direction, and adjusts the adjacent bendpoint to keep the
 * polyline orthogonal.
 */
export function adjustOrthogonalConnectionEndpoints(
  points: Point[],
  sourceNode: ViewNodeLayout,
  targetNode: ViewNodeLayout,
  opts?: {
    /** How far (in model units) the connection should "stub" out of the node before turning. */
    stubLength?: number;
  }
): Point[] {
  if (points.length < 2) return points;

  const res = points.map((p) => ({ ...p }));
  const sRect = nodeRect(sourceNode);
  const tRect = nodeRect(targetNode);

  // Adjust start based on first segment direction.
  {
    const p0 = res[0];
    const p1 = res[1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    if (dx === 0 && dy !== 0) {
      const side: Side = dy > 0 ? 'bottom' : 'top';
      const a = anchorOnRect(sRect, side, p0.x);
      res[0] = a;
      // Keep the next point on the correct side of the snapped anchor so the
      // segment direction stays consistent after snapping.
      const nextY = side === 'bottom' ? Math.max(res[1].y, a.y) : Math.min(res[1].y, a.y);
      res[1] = { ...res[1], x: a.x, y: nextY };
    } else if (dy === 0 && dx !== 0) {
      const side: Side = dx > 0 ? 'right' : 'left';
      const a = anchorOnRect(sRect, side, p0.y);
      res[0] = a;
      const nextX = side === 'right' ? Math.max(res[1].x, a.x) : Math.min(res[1].x, a.x);
      res[1] = { ...res[1], y: a.y, x: nextX };
    }
  }

  // Adjust end based on last segment direction.
  {
    const last = res.length - 1;
    const pN1 = res[last - 1];
    const pN = res[last];
    const dx = pN.x - pN1.x;
    const dy = pN.y - pN1.y;
    if (dx === 0 && dy !== 0) {
      const side: Side = dy > 0 ? 'top' : 'bottom';
      const a = anchorOnRect(tRect, side, pN.x);
      res[last] = a;
      const prevY = side === 'top' ? Math.min(res[last - 1].y, a.y) : Math.max(res[last - 1].y, a.y);
      res[last - 1] = { ...res[last - 1], x: a.x, y: prevY };
    } else if (dy === 0 && dx !== 0) {
      const side: Side = dx > 0 ? 'left' : 'right';
      const a = anchorOnRect(tRect, side, pN.y);
      res[last] = a;
      const prevX = side === 'left' ? Math.min(res[last - 1].x, a.x) : Math.max(res[last - 1].x, a.x);
      res[last - 1] = { ...res[last - 1], y: a.y, x: prevX };
    }
  }

  // Add short "exit" / "entry" stubs so the first/last segments never run behind the
  // source/target node. This makes detours look more natural.
  const stub = Math.max(6, opts?.stubLength ?? 10);

  const withStubs: Point[] = res.map((p) => ({ ...p }));

  // Start stub
  if (withStubs.length >= 2) {
    const a = withStubs[0];
    const b = withStubs[1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dy === 0 && dx !== 0) {
      // Horizontal out
      const dir = dx > 0 ? 1 : -1;
      const desiredX = dir > 0 ? sRect.x + sRect.w + stub : sRect.x - stub;
      const stubX = dir > 0 ? Math.max(desiredX, b.x) : Math.min(desiredX, b.x);
      const stubPt: Point = { x: stubX, y: a.y };
      // Insert stub if it meaningfully extends outwards.
      if (stubPt.x !== a.x) {
        withStubs.splice(1, 0, stubPt);
      }
      // If the next point was inside/behind the node, push it out to at least the stub.
      const next = withStubs[2];
      if (next && next.y === a.y) {
        if (dir > 0) next.x = Math.max(next.x, stubPt.x);
        else next.x = Math.min(next.x, stubPt.x);
      }
    } else if (dx === 0 && dy !== 0) {
      // Vertical out
      const dir = dy > 0 ? 1 : -1;
      const desiredY = dir > 0 ? sRect.y + sRect.h + stub : sRect.y - stub;
      const stubY = dir > 0 ? Math.max(desiredY, b.y) : Math.min(desiredY, b.y);
      const stubPt: Point = { x: a.x, y: stubY };
      if (stubPt.y !== a.y) {
        withStubs.splice(1, 0, stubPt);
      }
      const next = withStubs[2];
      if (next && next.x === a.x) {
        if (dir > 0) next.y = Math.max(next.y, stubPt.y);
        else next.y = Math.min(next.y, stubPt.y);
      }
    }
  }

  // End stub
  if (withStubs.length >= 3) {
    const last = withStubs.length - 1;
    const a = withStubs[last - 1];
    const b = withStubs[last];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dy === 0 && dx !== 0) {
      // Horizontal into target
      const dir = dx > 0 ? 1 : -1;
      // If we move right into the target, we approach from the left, so stub is to the left.
      const desiredX = dir > 0 ? tRect.x - stub : tRect.x + tRect.w + stub;
      const stubX = dir > 0 ? Math.min(desiredX, a.x) : Math.max(desiredX, a.x);
      const stubPt: Point = { x: stubX, y: b.y };
      if (stubPt.x !== b.x) {
        withStubs.splice(last, 0, stubPt);
      }
      // Ensure the point before the stub is not inside the target by forcing the approach
      // point to be on the same outside-x as the stub. Also adjust the preceding point to
      // preserve orthogonality for a vertical segment.
      const preIdx = withStubs.length - 3;
      const pre = withStubs[preIdx];
      if (pre) {
        const oldX = pre.x;
        pre.x = stubPt.x;
        if (preIdx - 1 >= 0 && withStubs[preIdx - 1].x === oldX) {
          withStubs[preIdx - 1].x = stubPt.x;
        }
      }
    } else if (dx === 0 && dy !== 0) {
      // Vertical into target
      const dir = dy > 0 ? 1 : -1;
      // If we move down into the target, we approach from the top, so stub is above.
      const desiredY = dir > 0 ? tRect.y - stub : tRect.y + tRect.h + stub;
      const stubY = dir > 0 ? Math.min(desiredY, a.y) : Math.max(desiredY, a.y);
      const stubPt: Point = { x: b.x, y: stubY };
      if (stubPt.y !== b.y) {
        withStubs.splice(last, 0, stubPt);
      }
      const preIdx = withStubs.length - 3;
      const pre = withStubs[preIdx];
      if (pre) {
        const oldY = pre.y;
        pre.y = stubPt.y;
        if (preIdx - 1 >= 0 && withStubs[preIdx - 1].y === oldY) {
          withStubs[preIdx - 1].y = stubPt.y;
        }
      }
    }
  }

  // Simplify: remove duplicates and collinear midpoints.
  const simplified: Point[] = [];
  for (const p of withStubs) {
    const prev = simplified[simplified.length - 1];
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    simplified.push(p);
  }
  if (simplified.length >= 3) {
    const out: Point[] = [simplified[0]];
    for (let i = 1; i < simplified.length - 1; i += 1) {
      const p0 = out[out.length - 1];
      const p1 = simplified[i];
      const p2 = simplified[i + 1];
      const collinearH = p0.y === p1.y && p1.y === p2.y;
      const collinearV = p0.x === p1.x && p1.x === p2.x;
      if (collinearH || collinearV) continue;
      out.push(p1);
    }
    out.push(simplified[simplified.length - 1]);
    return out;
  }

  return simplified;
}
