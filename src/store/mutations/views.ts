import type { Model, TaggedValue, View, ViewFormatting, ViewLayout, ViewObject } from '../../domain';
import { createId, createView, removeTaggedValue, tidyExternalIds, upsertTaggedValue } from '../../domain';
import type { TaggedValueInput } from './helpers';
import {
  deleteViewInModel,
  findFolderContainingView,
  findFolderIdByKind,
  getFolder
} from './helpers';

function getOwnedElementId(model: Model, view: View): string | undefined {
  // New ownership model: use ownerRef when it points at an existing element.
  const ownerId = view.ownerRef?.kind === 'archimate' ? view.ownerRef.id : undefined;
  if (ownerId && model.elements[ownerId]) return ownerId;
  return undefined;
}

function removeViewFromAllFolders(model: Model, viewId: string): void {
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid];
    if (f.viewIds.includes(viewId)) {
      model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== viewId) };
    }
  }
}

function ensureViewInRootFolder(model: Model, viewId: string): void {
  const inFolder = Object.values(model.folders).some((f) => f.viewIds.includes(viewId));
  if (inFolder) return;
  const rootId = findFolderIdByKind(model, 'root');
  const root = getFolder(model, rootId);
  model.folders[rootId] = root.viewIds.includes(viewId) ? root : { ...root, viewIds: [...root.viewIds, viewId] };
}

export function addView(model: Model, view: View, folderId?: string): void {
  // Normalize: if we have a legacy centered view, also persist an ownerRef.
  const ownedId = getOwnedElementId(model, view);
  const normalized: View =
    ownedId && !view.ownerRef
      ? {
          ...view,
          ownerRef: { kind: 'archimate', id: ownedId }
        }
      : view;

  model.views[normalized.id] = normalized;

  // Owned views should not live in any folder (they are nested under their owning element).
  if (ownedId) {
    removeViewFromAllFolders(model, normalized.id);
    return;
  }

  const targetFolderId = folderId ?? findFolderIdByKind(model, 'root');
  const folder = getFolder(model, targetFolderId);
  if (!folder.viewIds.includes(normalized.id)) {
    model.folders[targetFolderId] = { ...folder, viewIds: [...folder.viewIds, normalized.id] };
  }
}

export function updateView(model: Model, viewId: string, patch: Partial<Omit<View, 'id'>>): void {
  const current = model.views[viewId];
  if (!current) throw new Error(`View not found: ${viewId}`);

  const next: View = { ...current, ...patch };

  const ownedId = getOwnedElementId(model, next);
  if (ownedId) {
    // Owned views should not live in any folder.
    removeViewFromAllFolders(model, viewId);
  } else {
    // Non-owned views must live in at least one folder (root fallback).
    ensureViewInRootFolder(model, viewId);
  }

  next.externalIds = tidyExternalIds(next.externalIds);
  model.views[viewId] = next;
}

export function upsertViewTaggedValue(model: Model, viewId: string, entry: TaggedValueInput): void {
  const current = model.views[viewId];
  if (!current) throw new Error(`View not found: ${viewId}`);

  const withId: TaggedValue = {
    id: entry.id && entry.id.trim() ? entry.id : createId('tag'),
    ns: entry.ns,
    key: entry.key,
    type: entry.type,
    value: entry.value
  };

  const nextTaggedValues = upsertTaggedValue(current.taggedValues, withId);
  model.views[viewId] = {
    ...current,
    taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
  };
}

export function removeViewTaggedValue(model: Model, viewId: string, taggedValueId: string): void {
  const current = model.views[viewId];
  if (!current) throw new Error(`View not found: ${viewId}`);

  const nextTaggedValues = removeTaggedValue(current.taggedValues, taggedValueId);
  model.views[viewId] = {
    ...current,
    taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
  };
}

export function updateViewFormatting(model: Model, viewId: string, patch: Partial<ViewFormatting>): void {
  const view = model.views[viewId];
  if (!view) return;

  const prev = view.formatting ?? { snapToGrid: true, gridSize: 20, layerStyleTags: {} };
  const next: ViewFormatting = {
    ...prev,
    ...patch,
    layerStyleTags: { ...(prev.layerStyleTags ?? {}), ...(patch.layerStyleTags ?? {}) }
  };

  model.views[viewId] = { ...view, formatting: next };
}

/** Clone a view (including its layout) into the same folder as the original. Returns the new view id. */
export function cloneView(model: Model, viewId: string): string | null {
  const original = model.views[viewId];
  if (!original) return null;

  const baseName = original.name.trim() || 'View';
  const existingNames = new Set(Object.values(model.views).map((v) => v.name));
  let name = `Copy of ${baseName}`;
  if (existingNames.has(name)) {
    let i = 2;
    while (existingNames.has(`${name} (${i})`)) i++;
    name = `${name} (${i})`;
  }

  // NOTE: view-local objects must get new ids when cloning, since ids are globally unique.
  const origObjects = (original.objects ?? {}) as Record<string, ViewObject>;
  const objectIdMap = new Map<string, string>();
  const nextObjects: Record<string, ViewObject> = {};
  for (const o of Object.values(origObjects)) {
    const nextId = createId('obj');
    objectIdMap.set(o.id, nextId);
    nextObjects[nextId] = { ...(JSON.parse(JSON.stringify(o)) as ViewObject), id: nextId };
  }
  const nextLayout: ViewLayout | undefined = original.layout ? (JSON.parse(JSON.stringify(original.layout)) as ViewLayout) : undefined;
  if (nextLayout && objectIdMap.size > 0) {
    nextLayout.nodes = nextLayout.nodes.map((n) => {
      if (!n.objectId) return n;
      const mapped = objectIdMap.get(n.objectId);
      return mapped ? { ...n, objectId: mapped } : n;
    });
  }

  const clone = createView({
    name,
    viewpointId: original.viewpointId,
    documentation: original.documentation,
    stakeholders: original.stakeholders ? [...original.stakeholders] : undefined,
    formatting: original.formatting ? JSON.parse(JSON.stringify(original.formatting)) : undefined,
    ownerRef: original.ownerRef ? { ...original.ownerRef } : undefined,
    objects: nextObjects,
    layout: nextLayout
  });

  model.views[clone.id] = clone;

  // Preserve placement: if the original is owned/centered, keep it out of folders.
  const owned = getOwnedElementId(model, clone);
  if (!owned) {
    const folderId = findFolderContainingView(model, viewId) ?? findFolderIdByKind(model, 'root');
    model.folders[folderId] = {
      ...model.folders[folderId],
      viewIds: [...model.folders[folderId].viewIds, clone.id]
    };
  } else {
    removeViewFromAllFolders(model, clone.id);
  }

  return clone.id;
}

export function deleteView(model: Model, viewId: string): void {
  deleteViewInModel(model, viewId);
}
