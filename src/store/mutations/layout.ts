import type { Model, ViewNodeLayout, ViewRelationshipLayout } from '../../domain';
import { materializeViewConnectionsForView } from '../../domain';
import { ensureViewLayout, getView } from './helpers';

function syncViewConnections(model: Model, viewId: string): void {
  const v = model.views[viewId];
  if (!v) return;
  const next = materializeViewConnectionsForView(model, v);
  // Reduce churn when nothing changes.
  if (next !== v.connections) {
    model.views[viewId] = { ...v, connections: next };
  }
}


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

  const isBpmn = viewWithLayout.kind === 'bpmn';
  const isPool = isBpmn && element.type === 'bpmn.pool';
  const isLane = isBpmn && element.type === 'bpmn.lane';

  const nodeW = isPool ? 680 : isLane ? 680 : 140;
  const nodeH = isPool ? 300 : isLane ? 140 : 70;

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const minZ = layout.nodes.reduce((m, n, idx) => Math.min(m, typeof n.zIndex === 'number' ? n.zIndex : idx), 0);
  const z = isPool ? minZ - 2 : isLane ? minZ - 1 : maxZ + 1;

  const node: ViewNodeLayout = { elementId, x, y, width: nodeW, height: nodeH, zIndex: z };

  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };
  syncViewConnections(model, viewId);

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

  const isBpmn = viewWithLayout.kind === 'bpmn';
  const isPool = isBpmn && element.type === 'bpmn.pool';
  const isLane = isBpmn && element.type === 'bpmn.lane';

  const nodeW = isPool ? 680 : isLane ? 680 : 140;
  const nodeH = isPool ? 300 : isLane ? 140 : 70;
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
    syncViewConnections(model, viewId);
    return elementId;
  }

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const minZ = layout.nodes.reduce((m, n, idx) => Math.min(m, typeof n.zIndex === 'number' ? n.zIndex : idx), 0);
  const z = isPool ? minZ - 2 : isLane ? minZ - 1 : maxZ + 1;
  const node: ViewNodeLayout = { elementId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: z };
  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };
  syncViewConnections(model, viewId);

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
    syncViewConnections(model, viewId);
    return connectorId;
  }

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const node: ViewNodeLayout = { connectorId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: maxZ + 1 };
  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };
  syncViewConnections(model, viewId);

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
  syncViewConnections(model, viewId);
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
  const moved = layout.nodes.find((n) => {
    if (ref.elementId && n.elementId === ref.elementId) return true;
    if (ref.connectorId && n.connectorId === ref.connectorId) return true;
    if (ref.objectId && n.objectId === ref.objectId) return true;
    return false;
  });

  // If the node does not exist, we can't apply the move.
  if (!moved) return;

  // TypeScript doesn't reliably preserve narrowing for captured variables inside
  // nested helper functions. Use a non-optional local for those helpers.
  const movedNode: ViewNodeLayout = moved;

  const dx = x - movedNode.x;
  const dy = y - movedNode.y;

  // Identify nodes fully contained within the moved node (prior to the move),
  // and move them by the same delta. This makes "container" nodes behave as
  // expected (e.g. Pools/Lanes), and is generally useful for group-like shapes.
  const pad = 2; // small tolerance so touching borders still counts as "inside"
  const container = { x: movedNode.x, y: movedNode.y, w: movedNode.width, h: movedNode.height };

  function isSameNode(n: ViewNodeLayout): boolean {
    if (movedNode.elementId && n.elementId === movedNode.elementId) return true;
    if (movedNode.connectorId && n.connectorId === movedNode.connectorId) return true;
    if (movedNode.objectId && n.objectId === movedNode.objectId) return true;
    return false;
  }

  function isFullyInside(n: ViewNodeLayout): boolean {
    // Guard against missing sizes (shouldn't happen, but keep it safe).
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    return (
      n.x >= container.x + pad &&
      n.y >= container.y + pad &&
      n.x + w <= container.x + container.w - pad &&
      n.y + h <= container.y + container.h - pad
    );
  }

  const moveAlso = dx !== 0 || dy !== 0 ? new Set<string>() : null;

  if (moveAlso) {
    for (const n of layout.nodes) {
      if (isSameNode(n)) continue;
      if (!isFullyInside(n)) continue;

      // Use a stable key for Set membership across element/connector/object nodes.
      if (n.elementId) moveAlso.add(`e:${n.elementId}`);
      else if (n.connectorId) moveAlso.add(`c:${n.connectorId}`);
      else if (n.objectId) moveAlso.add(`o:${n.objectId}`);
    }
  }

  const nextNodes = layout.nodes.map((n) => {
    const matchesElement = ref.elementId && n.elementId === ref.elementId;
    const matchesConnector = ref.connectorId && n.connectorId === ref.connectorId;
    const matchesObject = ref.objectId && n.objectId === ref.objectId;
    const isPrimary = Boolean(matchesElement || matchesConnector || matchesObject);

    const key = n.elementId ? `e:${n.elementId}` : n.connectorId ? `c:${n.connectorId}` : n.objectId ? `o:${n.objectId}` : '';
    const shouldMoveWith = Boolean(moveAlso && key && moveAlso.has(key));

    if (!isPrimary && !shouldMoveWith) return n;
    if (isPrimary) return { ...n, x, y };
    return { ...n, x: n.x + dx, y: n.y + dy };
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
