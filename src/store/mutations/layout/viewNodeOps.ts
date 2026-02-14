import type { Model, ViewNodeLayout, ViewRelationshipLayout } from '../../../domain';
import { ensureViewLayout, getView } from '../helpers';
import { syncViewConnections } from './syncViewConnections';
import { defaultBpmnNodeSize } from './defaults/bpmn';
import { defaultUmlNodePresentationAttrs, defaultUmlNodeSize } from './defaults/uml';

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
  // Default placement grid for "add to view" (not cursor-based).
  const nx = 24 + (i % cols) * 160;
  const ny = 24 + Math.floor(i / cols) * 110;

  const isBpmn = viewWithLayout.kind === 'bpmn';
  const isUml = viewWithLayout.kind === 'uml';
  const bpmnSize = isBpmn ? defaultBpmnNodeSize(String(element.type)) : null;
  const umlSize = isUml ? defaultUmlNodeSize(String(element.type)) : null;

  const nodeW = isBpmn && bpmnSize ? bpmnSize.width : isUml && umlSize ? umlSize.width : 140;
  const nodeH = isBpmn && bpmnSize ? bpmnSize.height : isUml && umlSize ? umlSize.height : 70;

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const minZ = layout.nodes.reduce((m, n, idx) => Math.min(m, typeof n.zIndex === 'number' ? n.zIndex : idx), 0);
  const t = String(element.type);
  const isPool = isBpmn && t === 'bpmn.pool';
  const isLane = isBpmn && t === 'bpmn.lane';
  const z = isPool ? minZ - 2 : isLane ? minZ - 1 : maxZ + 1;
  const attrs = viewWithLayout.kind === 'uml' ? defaultUmlNodePresentationAttrs(String(element.type)) : undefined;
  const node: ViewNodeLayout = { elementId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: z, attrs };
  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: [...layout.nodes, node], relationships: layout.relationships }
  };
  syncViewConnections(model, viewId);

  return elementId;
}

/**
 * Adds multiple elements to a view efficiently (idempotent).
 *
 * This avoids calling syncViewConnections() once per element (which can be expensive
 * for large folders). After all nodes are added, connections are synced exactly once.
 */
export function addElementsToView(model: Model, viewId: string, elementIds: string[]): string[] {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);

  const viewWithLayout = ensureViewLayout(view);
  const layout = viewWithLayout.layout;

  const existing = new Set(layout.nodes.map((n) => n.elementId).filter(Boolean) as string[]);
  const isBpmn = viewWithLayout.kind === 'bpmn';
  const isUml = viewWithLayout.kind === 'uml';

  const nextNodes = layout.nodes.slice();

  // Continue the simple default placement grid for any new nodes.
  const cols = 4;
  let i = nextNodes.length;

  const maxZ0 = nextNodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const minZ0 = nextNodes.reduce((m, n, idx) => Math.min(m, typeof n.zIndex === 'number' ? n.zIndex : idx), 0);
  let maxZ = maxZ0;
  const minZ = minZ0;

  const added: string[] = [];

  for (const elementId of elementIds) {
    if (!elementId || existing.has(elementId)) continue;
    const element = model.elements[elementId];
    if (!element) continue;

    const nx = 24 + (i % cols) * 160;
    const ny = 24 + Math.floor(i / cols) * 110;
    i++;

    const t = String(element.type);
    const bpmnSize = isBpmn ? defaultBpmnNodeSize(t) : null;
    const umlSize = isUml ? defaultUmlNodeSize(t) : null;

    const nodeW = isBpmn && bpmnSize ? bpmnSize.width : isUml && umlSize ? umlSize.width : 140;
    const nodeH = isBpmn && bpmnSize ? bpmnSize.height : isUml && umlSize ? umlSize.height : 70;

    const isPool = isBpmn && t === 'bpmn.pool';
    const isLane = isBpmn && t === 'bpmn.lane';
    const z = isPool ? minZ - 2 : isLane ? minZ - 1 : maxZ + 1;
    if (!isPool && !isLane) maxZ = Math.max(maxZ, z);

    const attrs = viewWithLayout.kind === 'uml' ? defaultUmlNodePresentationAttrs(t) : undefined;
    const node: ViewNodeLayout = { elementId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: z, attrs };
    nextNodes.push(node);
    existing.add(elementId);
    added.push(elementId);
  }

  if (added.length === 0) return [];

  model.views[viewId] = {
    ...viewWithLayout,
    layout: { nodes: nextNodes, relationships: layout.relationships }
  };
  syncViewConnections(model, viewId);

  return added;
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
  const isUml = viewWithLayout.kind === 'uml';
  const bpmnSize = isBpmn ? defaultBpmnNodeSize(String(element.type)) : null;
  const umlSize = isUml ? defaultUmlNodeSize(String(element.type)) : null;

  const nodeW = isBpmn && bpmnSize ? bpmnSize.width : isUml && umlSize ? umlSize.width : 140;
  const nodeH = isBpmn && bpmnSize ? bpmnSize.height : isUml && umlSize ? umlSize.height : 70;

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
  const t = String(element.type);
  const isPool = isBpmn && t === 'bpmn.pool';
  const isLane = isBpmn && t === 'bpmn.lane';
  const z = isPool ? minZ - 2 : isLane ? minZ - 1 : maxZ + 1;

  const attrs = viewWithLayout.kind === 'uml' ? defaultUmlNodePresentationAttrs(String(element.type)) : undefined;
  const node: ViewNodeLayout = { elementId, x: nx, y: ny, width: nodeW, height: nodeH, zIndex: z, attrs };
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
