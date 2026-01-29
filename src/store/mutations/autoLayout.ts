import type { Model, ViewNodeLayout } from '../../domain/types';
import type { LayoutOutput } from '../../domain/layout/types';
import { getView } from './helpers';
import { syncViewConnections } from './layout/syncViewConnections';

function nodeIdFromLayoutNode(n: ViewNodeLayout): string | null {
  if (typeof n.elementId === 'string' && n.elementId.length > 0) return n.elementId;
  if (typeof n.connectorId === 'string' && n.connectorId.length > 0) return n.connectorId;
  // Ignore view-local objects for auto layout (notes/labels/group boxes)
  return null;
}

/**
 * Apply auto-layout node positions to a view.
 *
 * This mutation is intentionally sync and side-effect free outside of updating the model object.
 * The layout computation (ELK) is performed elsewhere (e.g. ModelStore command).
 */
export function autoLayoutView(model: Model, viewId: string, positions: LayoutOutput['positions']): void {
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
  geometryById: Record<string, NodeGeometryUpdate>
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
}
