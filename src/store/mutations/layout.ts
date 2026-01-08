import type { Model, ViewNodeLayout, ViewRelationshipLayout } from '../../domain';
import { ensureViewLayout, getView } from './helpers';

export function updateViewNodeLayout(
  model: Model,
  viewId: string,
  elementId: string,
  patch: Partial<Omit<ViewNodeLayout, 'elementId'>>
): void {
  const view = model.views[viewId];
  if (!view) return;

  const viewWithLayout = ensureViewLayout(view);
  const idx = viewWithLayout.layout.nodes.findIndex((n) => n.elementId === elementId);
  if (idx < 0) return;

  const prev = viewWithLayout.layout.nodes[idx];
  const next: ViewNodeLayout = { ...prev, ...patch, elementId: prev.elementId };
  const nextNodes = viewWithLayout.layout.nodes.slice();
  nextNodes[idx] = next;

  model.views[viewId] = { ...viewWithLayout, layout: { ...viewWithLayout.layout, nodes: nextNodes } };
}

/** Adds an element to a view's layout as a positioned node (idempotent). */
export function addElementToView(model: Model, viewId: string, elementId: string): string {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  const element = model.elements[elementId];
  if (!element) throw new Error(`Element not found: ${elementId}`);

  const viewWithLayout = ensureViewLayout(view);
  const layout = viewWithLayout.layout;

  if (layout.nodes.some((n) => n.elementId === elementId)) return elementId;

  const i = layout.nodes.length;
  const cols = 4;
  const x = 24 + (i % cols) * 160;
  const y = 24 + Math.floor(i / cols) * 110;

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const node: ViewNodeLayout = { elementId, x, y, width: 140, height: 70, zIndex: maxZ + 1 };

  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };

  return elementId;
}

/**
 * Adds an element to a view at a specific position (idempotent).
 * If the node already exists in the view, its position is updated.
 */
export function addElementToViewAt(model: Model, viewId: string, elementId: string, x: number, y: number): string {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  const element = model.elements[elementId];
  if (!element) throw new Error(`Element not found: ${elementId}`);

  const viewWithLayout = ensureViewLayout(view);
  const layout = viewWithLayout.layout;

  const snap = Boolean(viewWithLayout.formatting?.snapToGrid);
  const grid = viewWithLayout.formatting?.gridSize ?? 20;

  const nodeW = 140;
  const nodeH = 70;
  // Drop position is interpreted as the cursor position; center the node under it.
  let nx = Math.max(0, x - nodeW / 2);
  let ny = Math.max(0, y - nodeH / 2);
  if (snap && grid > 1) {
    nx = Math.round(nx / grid) * grid;
    ny = Math.round(ny / grid) * grid;
  }

  const existing = layout.nodes.find((n) => n.elementId === elementId);
  if (existing) {
    const nextNodes = layout.nodes.map((n) => (n.elementId === elementId ? { ...n, x: nx, y: ny } : n));
    model.views[viewId] = { ...viewWithLayout, layout: { nodes: nextNodes, relationships: layout.relationships } };
    return elementId;
  }

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const node: ViewNodeLayout = { elementId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: maxZ + 1 };
  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };

  return elementId;
}

/** Adds a connector (junction) to a view at a specific position (idempotent). */
export function addConnectorToViewAt(model: Model, viewId: string, connectorId: string, x: number, y: number): string {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  const connector = model.connectors?.[connectorId];
  if (!connector) throw new Error(`Connector not found: ${connectorId}`);

  const viewWithLayout = ensureViewLayout(view);
  const layout = viewWithLayout.layout;

  const snap = Boolean(viewWithLayout.formatting?.snapToGrid);
  const grid = viewWithLayout.formatting?.gridSize ?? 20;

  const nodeW = 24;
  const nodeH = 24;
  // Drop position is interpreted as the cursor position; center the node under it.
  let nx = Math.max(0, x - nodeW / 2);
  let ny = Math.max(0, y - nodeH / 2);
  if (snap && grid > 1) {
    nx = Math.round(nx / grid) * grid;
    ny = Math.round(ny / grid) * grid;
  }

  const existing = layout.nodes.find((n) => n.connectorId === connectorId);
  if (existing) {
    const nextNodes = layout.nodes.map((n) =>
      n.connectorId === connectorId ? { ...n, x: nx, y: ny, width: nodeW, height: nodeH } : n
    );
    model.views[viewId] = { ...viewWithLayout, layout: { nodes: nextNodes, relationships: layout.relationships } };
    return connectorId;
  }

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const node: ViewNodeLayout = { connectorId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: maxZ + 1 };
  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };

  return connectorId;
}

export function removeElementFromView(model: Model, viewId: string, elementId: string): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const layout = view.layout;
  const nextNodes = layout.nodes.filter((n) => n.elementId !== elementId);

  // Drop any connections whose relationship no longer exists.
  const nextConnections: ViewRelationshipLayout[] = layout.relationships.filter((c) => Boolean(model.relationships[c.relationshipId]));

  if (nextNodes.length === layout.nodes.length && nextConnections.length === layout.relationships.length) return;
  model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: nextConnections } };
}

export function updateViewNodePosition(model: Model, viewId: string, elementId: string, x: number, y: number): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const layout = view.layout;
  const node = layout.nodes.find((n) => n.elementId === elementId);
  if (!node) return;

  const nextNodes = layout.nodes.map((n) => (n.elementId === elementId ? { ...n, x, y } : n));
  model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
}

/** Updates position of an element-node, connector-node, or view-object node in a view. */
export function updateViewNodePositionAny(
  model: Model,
  viewId: string,
  ref: { elementId?: string; connectorId?: string; objectId?: string },
  x: number,
  y: number
): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const layout = view.layout;
  const nextNodes = layout.nodes.map((n) => {
    const matchesElement = ref.elementId && n.elementId === ref.elementId;
    const matchesConnector = ref.connectorId && n.connectorId === ref.connectorId;
    const matchesObject = ref.objectId && n.objectId === ref.objectId;
    if (!matchesElement && !matchesConnector && !matchesObject) return n;
    return { ...n, x, y };
  });

  model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
}

/** Updates layout properties on an element-node, connector-node, or view-object node in a view. */
export function updateViewNodeLayoutAny(
  model: Model,
  viewId: string,
  ref: { elementId?: string; connectorId?: string; objectId?: string },
  patch: Partial<Omit<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'>>
): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const layout = view.layout;
  const nextNodes = layout.nodes.map((n) => {
    const matchesElement = ref.elementId && n.elementId === ref.elementId;
    const matchesConnector = ref.connectorId && n.connectorId === ref.connectorId;
    const matchesObject = ref.objectId && n.objectId === ref.objectId;
    if (!matchesElement && !matchesConnector && !matchesObject) return n;

    // Preserve whichever identity field this node uses.
    const idFields: Pick<ViewNodeLayout, 'elementId' | 'connectorId' | 'objectId'> = {
      elementId: n.elementId,
      connectorId: n.connectorId,
      objectId: n.objectId
    };

    return { ...n, ...patch, ...idFields };
  });

  model.views[viewId] = { ...view, layout: { nodes: nextNodes, relationships: layout.relationships } };
}
