import type { LayoutEdge, LayoutOutput } from '../types';

type Point = { x: number; y: number };

type Positions = Record<string, Point>;

type EdgeRoutes = LayoutOutput['edgeRoutes'];

type EdgeRoute = { points: Array<{ x: number; y: number }> };

function delta(from: Point | undefined, to: Point | undefined): Point | null {
  if (!from || !to) return null;
  return { x: to.x - from.x, y: to.y - from.y };
}

function add(p: Point, d: Point): Point {
  return { x: p.x + d.x, y: p.y + d.y };
}

function average(a: Point | null, b: Point | null): Point {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (a) return a;
  if (b) return b;
  return { x: 0, y: 0 };
}

export function adjustEdgeRoutesForMovedNodes(
  edgeRoutes: EdgeRoutes | undefined,
  edges: LayoutEdge[],
  fromPositions: Positions,
  toPositions: Positions
): EdgeRoutes | undefined {
  if (!edgeRoutes) return undefined;

  const next: Record<string, EdgeRoute> = {};
  for (const e of edges) {
    const route = (edgeRoutes as Record<string, EdgeRoute>)[e.id];
    if (!route || !route.points || route.points.length === 0) continue;

    const ds = delta(fromPositions[e.sourceId], toPositions[e.sourceId]);
    const dt = delta(fromPositions[e.targetId], toPositions[e.targetId]);
    const d = average(ds, dt);

    if (d.x === 0 && d.y === 0) {
      next[e.id] = route;
      continue;
    }

    next[e.id] = { points: route.points.map((p) => add(p, d)) };
  }

  // Keep any routes that were not tied to an explicit edge (defensive for legacy ids).
  for (const [id, route] of Object.entries(edgeRoutes as Record<string, EdgeRoute>)) {
    if (next[id]) continue;
    next[id] = route;
  }

  return next;
}
