import type { Model, ViewNodeLayout, ViewObject, ViewObjectType } from '../../domain';
import { createViewObject, createViewObjectNodeLayout, getDefaultViewObjectSize } from '../../domain';
import { ensureViewLayout, getView } from './helpers';

export function addViewObject(model: Model, viewId: string, obj: ViewObject, node?: ViewNodeLayout): void {
  const view = getView(model, viewId);
  const viewWithLayout = ensureViewLayout(view);
  const layout = viewWithLayout.layout;

  const nextObjects = { ...(viewWithLayout.objects ?? {}) };
  nextObjects[obj.id] = obj;

  let nextNodes = layout.nodes;
  if (node) {
    const existingIdx = layout.nodes.findIndex((n) => n.objectId === obj.id);
    if (existingIdx >= 0) {
      nextNodes = layout.nodes.map((n) => (n.objectId === obj.id ? { ...n, ...node, objectId: obj.id } : n));
    } else {
      const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
      nextNodes = [
        ...layout.nodes,
        { ...node, objectId: obj.id, zIndex: typeof node.zIndex === 'number' ? node.zIndex : maxZ + 1 }
      ];
    }
  }

  model.views[viewId] = {
    ...viewWithLayout,
    objects: nextObjects,
    layout: { nodes: nextNodes, relationships: layout.relationships }
  };
}

export function createViewObjectInViewAt(model: Model, viewId: string, type: ViewObjectType, x: number, y: number): string {
  const obj = createViewObject({ type });
  const size = getDefaultViewObjectSize(type);

  const view = getView(model, viewId);
  const viewWithLayout = ensureViewLayout(view);
  const layout = viewWithLayout.layout;

  const snap = Boolean(viewWithLayout.formatting?.snapToGrid);
  const grid = viewWithLayout.formatting?.gridSize ?? 20;

  // Cursor position is treated as the center.
  let nx = Math.max(0, x - size.width / 2);
  let ny = Math.max(0, y - size.height / 2);
  if (snap && grid > 1) {
    nx = Math.round(nx / grid) * grid;
    ny = Math.round(ny / grid) * grid;
  }

  const node = createViewObjectNodeLayout(obj.id, nx, ny, size.width, size.height);
  const nextObjects = { ...(viewWithLayout.objects ?? {}) };
  nextObjects[obj.id] = obj;

  const maxZ = layout.nodes.reduce((m, n, idx) => Math.max(m, typeof n.zIndex === 'number' ? n.zIndex : idx), -1);
  const nextNodes = [...layout.nodes, { ...node, zIndex: maxZ + 1 }];

  model.views[viewId] = {
    ...viewWithLayout,
    objects: nextObjects,
    layout: { nodes: nextNodes, relationships: layout.relationships }
  };

  return obj.id;
}

export function updateViewObject(model: Model, viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>): void {
  const view = getView(model, viewId);
  const objects = (view.objects ?? {}) as Record<string, ViewObject>;
  const current = objects[objectId];
  if (!current) throw new Error(`ViewObject not found: ${objectId}`);

  const merged: ViewObject = {
    ...current,
    ...patch,
    id: current.id,
    name: typeof (patch as any).name === 'string' ? ((patch as any).name as string).trim() || undefined : current.name,
    text: typeof (patch as any).text === 'string' ? ((patch as any).text as string).trim() || undefined : current.text,
    style: patch.style ? { ...(current.style ?? {}), ...(patch.style ?? {}) } : current.style
  };

  model.views[viewId] = {
    ...view,
    objects: { ...objects, [objectId]: merged }
  };
}

export function deleteViewObject(model: Model, viewId: string, objectId: string): void {
  const view = getView(model, viewId);
  const objects = (view.objects ?? {}) as Record<string, ViewObject>;
  if (!objects[objectId]) return;

  const nextObjects = { ...objects };
  delete nextObjects[objectId];

  if (!view.layout) {
    model.views[viewId] = { ...view, objects: nextObjects };
    return;
  }

  const layout = view.layout;
  const nextNodes = layout.nodes.filter((n) => n.objectId !== objectId);
  model.views[viewId] = {
    ...view,
    objects: nextObjects,
    layout: { nodes: nextNodes, relationships: layout.relationships }
  };
}
