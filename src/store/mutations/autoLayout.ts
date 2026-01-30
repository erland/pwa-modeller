import type { Model, ViewConnection, ViewNodeLayout, ViewRelationshipLayout } from '../../domain/types';
import type { LayoutOutput } from '../../domain/layout/types';
import { getView } from './helpers';
import { syncViewConnections } from './layout/syncViewConnections';

function nodeIdFromLayoutNode(n: ViewNodeLayout): string | null {
  if (typeof n.elementId === 'string' && n.elementId.length > 0) return n.elementId;
  if (typeof n.connectorId === 'string' && n.connectorId.length > 0) return n.connectorId;
  // Ignore view-local objects for auto layout (notes/labels/group boxes)
  return null;
}

type EdgeRoutes = LayoutOutput['edgeRoutes'];

type Point = { x: number; y: number };

function pointsEqual(a?: Point[], b?: Point[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
}

function normalizeBendPoints(points: Point[]): Point[] {
  if (points.length <= 1) return points;

  // Remove consecutive duplicates.
  const dedup: Point[] = [];
  for (const p of points) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    dedup.push(p);
  }

  // Remove collinear mid-points (axis-aligned).
  const simplified: Point[] = [];
  for (const p of dedup) {
    simplified.push(p);
    while (simplified.length >= 3) {
      const c = simplified[simplified.length - 1];
      const b = simplified[simplified.length - 2];
      const a = simplified[simplified.length - 3];
      const collinearX = a.x === b.x && b.x === c.x;
      const collinearY = a.y === b.y && b.y === c.y;
      if (collinearX || collinearY) {
        // Remove b
        simplified.splice(simplified.length - 2, 1);
        continue;
      }
      break;
    }
  }

  return simplified;
}


function clearManualEdgePointsForView(model: Model, viewId: string): void {
  const view = getView(model, viewId);
  // For UML/BPMN we prefer the built-in router over persisted bend-points from ELK.
  // Persisted points cause stale/odd routing when nodes move after auto-layout.
  let changed = false;

  const nextConnections = (view.connections ?? []).map((c: ViewConnection) => {
    const hasPoints = Boolean(c.points);
    const hasAnchors = c.sourceAnchor !== undefined || c.targetAnchor !== undefined;
    if (!hasPoints && !hasAnchors) return c;

    changed = true;
    return {
      ...c,
      // Always reset endpoint anchoring overrides on auto layout.
      sourceAnchor: undefined,
      targetAnchor: undefined,
      // For UML/BPMN we also reset persisted bendpoints.
      points: view.kind === 'archimate' ? c.points : undefined,
    };
  });

  const nextLayoutRelationships = view.layout?.relationships?.map((r: ViewRelationshipLayout) => {
    if (!r.points) return r;
    changed = true;
    return { ...r, points: undefined };
  });

  if (!changed) return;

  model.views[viewId] = {
    ...view,
    connections: nextConnections,
    layout: view.layout
      ? {
          ...view.layout,
          relationships: nextLayoutRelationships ?? view.layout.relationships,
        }
      : view.layout,
  };
}

function applyEdgeRoutesToView(model: Model, viewId: string, edgeRoutes?: EdgeRoutes): void {
  if (!edgeRoutes) return;

  const view = getView(model, viewId);
  if (view.kind !== 'archimate') return;

  const routes = edgeRoutes as Record<string, { points: Point[] }>;
  const nextConnections = (view.connections ?? []).map((c: ViewConnection) => {
    const route = routes[c.id] ?? routes[c.relationshipId];
    if (!route) return c;

    const pts = route.points ?? [];
    const bend = pts.length > 2 ? pts.slice(1, -1) : [];
    const normalized = bend.length ? normalizeBendPoints(bend) : [];
    const nextPoints = normalized.length ? normalized : undefined;

    if (pointsEqual(c.points, nextPoints)) return c;
    return { ...c, points: nextPoints };
  });

  let changed = false;
  for (let i = 0; i < (view.connections ?? []).length; i++) {
    if (nextConnections[i] !== (view.connections ?? [])[i]) {
      changed = true;
      break;
    }
  }

  const nextLayoutRelationships = view.layout?.relationships?.map((r: ViewRelationshipLayout) => {
    const route = routes[r.relationshipId];
    if (!route) return r;
    const pts = route.points ?? [];
    const bend = pts.length > 2 ? pts.slice(1, -1) : [];
    const normalized = bend.length ? normalizeBendPoints(bend) : [];
    const nextPoints = normalized.length ? normalized : undefined;
    if (pointsEqual(r.points, nextPoints)) return r;
    return { ...r, points: nextPoints };
  });

  if (nextLayoutRelationships && view.layout?.relationships) {
    for (let i = 0; i < view.layout.relationships.length; i++) {
      if (nextLayoutRelationships[i] !== view.layout.relationships[i]) {
        changed = true;
        break;
      }
    }
  }

  if (!changed) return;

  model.views[viewId] = {
    ...view,
    connections: changed ? nextConnections : view.connections,
    layout: view.layout
      ? {
          ...view.layout,
          relationships: nextLayoutRelationships ?? view.layout.relationships,
        }
      : view.layout,
  };
}

/**
 * Apply auto-layout node positions to a view.
 *
 * This mutation is intentionally sync and side-effect free outside of updating the model object.
 * The layout computation (ELK) is performed elsewhere (e.g. ModelStore command).
 */
export function autoLayoutView(
  model: Model,
  viewId: string,
  positions: LayoutOutput['positions'],
  edgeRoutes?: EdgeRoutes
): void {
  const view = getView(model, viewId);
  if (!view.layout) throw new Error(`View has no layout: ${viewId}`);

  const nextNodes = view.layout.nodes.map((n) => {
    const id = nodeIdFromLayoutNode(n);
    if (!id) return n;
    const pos = positions[id];
    if (!pos) return n;
    // Keep width/height and other view-local attributes intact.
    if (n.x === pos.x && n.y === pos.y) return n;
    return { ...n, x: pos.x, y: pos.y };
  });

  // Reduce churn when nothing changes.
  if (nextNodes !== view.layout.nodes) {
    model.views[viewId] = { ...view, layout: { ...view.layout, nodes: nextNodes } };
  }

  // Ensure connections are consistent after layout changes.
  syncViewConnections(model, viewId);

  // Clear persisted bend-points for UML/BPMN so the router can recompute cleanly.
  clearManualEdgePointsForView(model, viewId);

  // Apply any computed edge routes last (so we patch the latest connection objects).
  applyEdgeRoutesToView(model, viewId, edgeRoutes);
}

export type NodeGeometryUpdate = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

/**
 * Apply auto-layout geometry (position + optional size) to a view.
 *
 * This is useful for notations with containers (BPMN pools/lanes/subprocesses), where
 * layout may want to grow container bounds to fit children.
 */
export function autoLayoutViewGeometry(
  model: Model,
  viewId: string,
  geometryById: Record<string, NodeGeometryUpdate>,
  edgeRoutes?: EdgeRoutes
): void {
  const view = getView(model, viewId);
  if (!view.layout) throw new Error(`View has no layout: ${viewId}`);

  const nextNodes = view.layout.nodes.map((n) => {
    const id = nodeIdFromLayoutNode(n);
    if (!id) return n;
    const g = geometryById[id];
    if (!g) return n;

    const next = {
      ...n,
      ...(typeof g.x === 'number' ? { x: g.x } : {}),
      ...(typeof g.y === 'number' ? { y: g.y } : {}),
      ...(typeof g.width === 'number' ? { width: g.width } : {}),
      ...(typeof g.height === 'number' ? { height: g.height } : {}),
    };

    if (next.x === n.x && next.y === n.y && next.width === n.width && next.height === n.height) return n;
    return next;
  });

  if (nextNodes !== view.layout.nodes) {
    model.views[viewId] = { ...view, layout: { ...view.layout, nodes: nextNodes } };
  }

  syncViewConnections(model, viewId);
  clearManualEdgePointsForView(model, viewId);
  applyEdgeRoutesToView(model, viewId, edgeRoutes);
}
