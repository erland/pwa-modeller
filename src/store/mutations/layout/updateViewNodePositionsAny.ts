import type { Model, ViewNodeLayout } from '../../../domain';
import { getView } from '../helpers';

type AnyRef = { elementId?: string; connectorId?: string; objectId?: string };

function keyForNode(n: ViewNodeLayout): string | null {
  if (n.elementId) return `e:${n.elementId}`;
  if (n.connectorId) return `c:${n.connectorId}`;
  if (n.objectId) return `o:${n.objectId}`;
  return null;
}

function keyForRef(ref: AnyRef): string | null {
  if (ref.elementId) return `e:${ref.elementId}`;
  if (ref.connectorId) return `c:${ref.connectorId}`;
  if (ref.objectId) return `o:${ref.objectId}`;
  return null;
}

/**
 * Batch position update for any view node type (element/connector/object).
 *
 * Used to support multi-select drag without triggering multiple store updates.
 * Intentionally keeps behavior simple: only explicitly listed nodes are moved.
 */
export function updateViewNodePositionsAny(
  model: Model,
  viewId: string,
  updates: Array<{ ref: AnyRef; x: number; y: number }>
): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const map = new Map<string, { x: number; y: number }>();
  for (const u of updates) {
    const k = keyForRef(u.ref);
    if (!k) continue;
    map.set(k, { x: u.x, y: u.y });
  }
  if (map.size === 0) return;

  const layout = view.layout;
  const nextNodes = layout.nodes.map((n) => {
    const k = keyForNode(n);
    if (!k) return n;
    const pos = map.get(k);
    if (!pos) return n;
    if (n.x === pos.x && n.y === pos.y) return n;
    return { ...n, x: pos.x, y: pos.y };
  });

  model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
}
