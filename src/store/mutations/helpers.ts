import type { Folder, Model, TaggedValue, View, ViewLayout } from '../../domain';
import { createId, validateTaggedValue } from '../../domain';

export type ViewWithLayout = View & { layout: ViewLayout };

export type TaggedValueInput = Omit<TaggedValue, 'id'> & { id?: string };

/**
 * Normalizes tagged values coming from UI editors:
 * - ensures id
 * - drops invalid entries
 * - de-dupes by (ns,key), keeping the last occurrence
 */
export function tidyTaggedValuesFromUi(list: TaggedValueInput[] | undefined): TaggedValue[] | undefined {
  if (!list || list.length === 0) return undefined;

  const normalized: TaggedValue[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;

    const { id, ...rest } = raw;
    const nextId = typeof id === 'string' && id.trim().length > 0 ? id.trim() : createId('tag');
    const withId: TaggedValue = {
      ...rest,
      id: nextId
    };

    const { normalized: tv, errors } = validateTaggedValue(withId);
    if (errors.length) continue;
    normalized.push(tv);
  }

  if (normalized.length === 0) return undefined;

  const lastIndex = new Map<string, number>();
  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i];
    lastIndex.set(`${t.ns ?? ''}::${t.key}`, i);
  }

  const deduped: TaggedValue[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i];
    if (lastIndex.get(`${t.ns ?? ''}::${t.key}`) === i) deduped.push(t);
  }

  return deduped.length ? deduped : undefined;
}

export function findFolderIdByKind(model: Model, kind: Folder['kind']): string {
  const folder = Object.values(model.folders).find((f) => f.kind === kind);
  if (!folder) throw new Error(`Model is missing required folder kind: ${kind}`);
  return folder.id;
}

export function findFolderContainingElement(model: Model, elementId: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (folder.elementIds.includes(elementId)) return folder.id;
  }
  return null;
}

export function findFolderContainingView(model: Model, viewId: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (folder.viewIds.includes(viewId)) return folder.id;
  }
  return null;
}

export function getFolder(model: Model, folderId: string): Folder {
  const folder = model.folders[folderId];
  if (!folder) throw new Error(`Folder not found: ${folderId}`);
  return folder;
}

export function getView(model: Model, viewId: string): View {
  const view = model.views[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  return view;
}

export function ensureViewLayout(view: View): ViewWithLayout {
  if (view.layout) return view as ViewWithLayout;
  return { ...view, layout: { nodes: [], relationships: [] } };
}

export function assertCanDeleteFolder(model: Model, folderId: string): void {
  const folder = getFolder(model, folderId);
  if (folder.kind === 'root') {
    throw new Error('Cannot delete root folder');
  }
}

export function deleteViewInModel(model: Model, viewId: string): void {
  if (!model.views[viewId]) return;

  const nextViews = { ...model.views };
  delete nextViews[viewId];
  model.views = nextViews;

  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid];
    if (f.viewIds.includes(viewId)) {
      model.folders[fid] = { ...f, viewIds: f.viewIds.filter((id) => id !== viewId) };
    }
  }
}

export function deleteRelationshipInModel(model: Model, relationshipId: string): void {
  if (!model.relationships[relationshipId]) return;

  const next = { ...model.relationships };
  delete next[relationshipId];
  model.relationships = next;

  // Remove from any folder that contains it.
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid];
    const relIds = f.relationshipIds;
    if (relIds && relIds.includes(relationshipId)) {
      model.folders[fid] = { ...f, relationshipIds: relIds.filter((id) => id !== relationshipId) };
    }
  }

  // Remove from any view layout connections.
  for (const view of Object.values(model.views)) {
    if (!view.layout) continue;
    const nextConnections = view.layout.relationships.filter((c) => c.relationshipId !== relationshipId);
    if (nextConnections.length !== view.layout.relationships.length) {
      model.views[view.id] = {
        ...view,
        layout: {
          nodes: view.layout.nodes,
          relationships: nextConnections
        }
      };
    }
  }
}

export function deleteElementInModel(model: Model, elementId: string): void {
  if (!model.elements[elementId]) return;

  // Reparent children to the deleted element's parent (recommended semantics).
  // This keeps the containment tree connected and prevents accidental data loss.
  const deleted = model.elements[elementId];
  const parentOfDeleted = deleted.parentElementId;
  for (const child of Object.values(model.elements)) {
    if (child.parentElementId === elementId) {
      model.elements[child.id] = {
        ...child,
        parentElementId: parentOfDeleted
      };
    }
  }

  // If the deleted element itself had an invalid parent (shouldn't happen after invariants),
  // keep it as-is; we only care about preserving its children.

  // Remove element itself
  const nextElements = { ...model.elements };
  delete nextElements[elementId];
  model.elements = nextElements;

  // Remove from any folder that contains it
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid];
    if (f.elementIds.includes(elementId)) {
      model.folders[fid] = { ...f, elementIds: f.elementIds.filter((id) => id !== elementId) };
    }
  }

  // If there are views owned/centered on this element, move them back to the root folder.
  const rootId = findFolderIdByKind(model, 'root');
  const rootFolder = getFolder(model, rootId);
  let rootViewIds = rootFolder.viewIds;
  let rootChanged = false;
  for (const view of Object.values(model.views)) {
    const isOwned = view.ownerRef?.kind === 'archimate' && view.ownerRef.id === elementId;
    if (isOwned) {
      model.views[view.id] = { ...view, ownerRef: undefined };
      if (!rootViewIds.includes(view.id)) {
        if (!rootChanged) rootViewIds = [...rootViewIds];
        rootViewIds.push(view.id);
        rootChanged = true;
      }
    }
  }
  if (rootChanged) {
    model.folders[rootId] = { ...rootFolder, viewIds: rootViewIds };
  }

  // Remove relationships that reference it
  const relIdsToDelete = Object.values(model.relationships)
    .filter((r) => r.sourceElementId === elementId || r.targetElementId === elementId)
    .map((r) => r.id);

  for (const rid of relIdsToDelete) deleteRelationshipInModel(model, rid);

  // Remove any view layout nodes that reference the element, and
  // remove any view connections that reference deleted relationships.
  for (const view of Object.values(model.views)) {
    if (!view.layout) continue;
    const nextNodes = view.layout.nodes.filter((n) => n.elementId !== elementId);
    const nextConnections = view.layout.relationships.filter((c) => model.relationships[c.relationshipId]);
    if (nextNodes.length !== view.layout.nodes.length || nextConnections.length !== view.layout.relationships.length) {
      model.views[view.id] = {
        ...view,
        layout: {
          nodes: nextNodes,
          relationships: nextConnections
        }
      };
    }
  }
}