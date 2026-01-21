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
