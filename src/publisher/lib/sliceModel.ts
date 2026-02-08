import type { Model } from '../../domain';

function collectFolderSubtreeIds(model: Model, folderId: string): Set<string> {
  const out = new Set<string>();
  const stack: string[] = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const f = model.folders?.[id];
    for (const childId of f?.folderIds ?? []) {
      stack.push(childId);
    }
  }
  return out;
}

function collectFolderAncestorIds(model: Model, folderId: string): Set<string> {
  const out = new Set<string>();
  let cur: string | undefined = folderId;
  while (cur) {
    if (out.has(cur)) break;
    out.add(cur);
    cur = model.folders?.[cur]?.parentId;
  }
  return out;
}

function sliceFolders(model: Model, includedFolderIds: Set<string>, includedElementIds: Set<string>, includedRelationshipIds: Set<string>, includedViewIds: Set<string>): Model['folders'] {
  const folders: Model['folders'] = {};
  for (const fid of includedFolderIds) {
    const f = model.folders?.[fid];
    if (!f) continue;
    folders[fid] = {
      ...f,
      folderIds: (f.folderIds ?? []).filter((id) => includedFolderIds.has(id)),
      elementIds: (f.elementIds ?? []).filter((id) => includedElementIds.has(id)),
      relationshipIds: (f.relationshipIds ?? []).filter((id) => includedRelationshipIds.has(id)),
      viewIds: (f.viewIds ?? []).filter((id) => includedViewIds.has(id))
    };
  }
  return folders;
}

/**
 * Create a read-only publish slice containing:
 * - the requested view
 * - all elements present as nodes in that view
 * - all relationships whose endpoints are within that element set
 * - any connectors referenced by the view (if present in the model)
 *
 * Notes:
 * - Folders are preserved but their membership lists are filtered to the included ids.
 * - This is intended for publishing/stakeholder portal usage (not round-tripping back to EA).
 */
export function sliceModelForView(model: Model, viewId: string): Model {
  const view = model.views?.[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);

  const elementIds = new Set<string>();
  const connectorIds = new Set<string>();

  for (const n of view.layout?.nodes ?? []) {
    if (n.elementId) elementIds.add(n.elementId);
    if (n.connectorId) connectorIds.add(n.connectorId);
  }

  // Include ownerRef element if it points to an element in the model.
  if (view.ownerRef?.id && model.elements?.[view.ownerRef.id]) {
    elementIds.add(view.ownerRef.id);
  }

  // Gather relationship ids referenced by the view (explicit connections)
  const explicitRelationshipIds = new Set<string>();
  for (const c of view.connections ?? []) {
    if (c.relationshipId) explicitRelationshipIds.add(c.relationshipId);
    if (c.source.kind === 'connector') connectorIds.add(c.source.id);
    if (c.target.kind === 'connector') connectorIds.add(c.target.id);
  }
  for (const r of view.layout?.relationships ?? []) {
    if (r.relationshipId) explicitRelationshipIds.add(r.relationshipId);
  }

  const relationships: Model['relationships'] = {};
  const relationshipIds = new Set<string>();

  // Include relationships that are explicitly in the view, plus any where both endpoints are in the element set.
  for (const rel of Object.values(model.relationships ?? {})) {
    const isExplicit = explicitRelationshipIds.has(rel.id);
    const srcOk = rel.sourceElementId ? elementIds.has(rel.sourceElementId) : false;
    const dstOk = rel.targetElementId ? elementIds.has(rel.targetElementId) : false;

    // If the relationship uses connectors, include it only if it's explicit (for now),
    // as connector semantics are view-oriented.
    const usesConnectors = Boolean(rel.sourceConnectorId || rel.targetConnectorId);

    if (isExplicit || (!usesConnectors && srcOk && dstOk)) {
      relationships[rel.id] = rel;
      relationshipIds.add(rel.id);
      if (rel.sourceConnectorId) connectorIds.add(rel.sourceConnectorId);
      if (rel.targetConnectorId) connectorIds.add(rel.targetConnectorId);
    }
  }

  const elements: Model['elements'] = {};
  for (const id of elementIds) {
    const el = model.elements?.[id];
    if (el) elements[id] = el;
  }

  const views: Model['views'] = { [viewId]: view };

  // Filter connectors if present
  const connectors: Model['connectors'] | undefined = model.connectors
    ? Object.fromEntries(Object.entries(model.connectors).filter(([id]) => connectorIds.has(id)))
    : undefined;

  // Preserve folders but filter memberships to included ids to avoid dangling references.
  const folders: Model['folders'] = {};
  for (const [fid, f] of Object.entries(model.folders ?? {})) {
    folders[fid] = {
      ...f,
      elementIds: (f.elementIds ?? []).filter((id) => elementIds.has(id)),
      relationshipIds: (f.relationshipIds ?? []).filter((id) => relationshipIds.has(id)),
      viewIds: (f.viewIds ?? []).filter((id) => id === viewId),
      folderIds: (f.folderIds ?? []).filter((id) => Boolean(model.folders?.[id]))
    };
  }

  return {
    ...model,
    elements,
    relationships,
    connectors,
    views,
    folders
  };
}

/**
 * Create a read-only publish slice containing everything under the given folder (including subfolders).
 *
 * Rules:
 * - Start from folder subtree membership (folder + descendants).
 * - Include views referenced by those folders.
 * - Closure: include any elements/connectors referenced by included views (nodes + connections).
 * - Include relationships that are either explicitly referenced by included views or whose endpoints are within the final element set.
 * - Include the folder subtree plus its ancestor chain up to the root, filtering membership lists to the included ids.
 */
export function sliceModelForFolder(model: Model, folderId: string): Model {
  const start = model.folders?.[folderId];
  if (!start) throw new Error(`Folder not found: ${folderId}`);

  const subtreeFolderIds = collectFolderSubtreeIds(model, folderId);
  const ancestorFolderIds = collectFolderAncestorIds(model, folderId);

  const includedFolderIds = new Set<string>();
  for (const id of subtreeFolderIds) includedFolderIds.add(id);
  for (const id of ancestorFolderIds) includedFolderIds.add(id);

  const elementIds = new Set<string>();
  const viewIds = new Set<string>();
  const relationshipIdsFromFolders = new Set<string>();

  for (const fid of subtreeFolderIds) {
    const f = model.folders?.[fid];
    if (!f) continue;
    for (const id of f.elementIds ?? []) elementIds.add(id);
    for (const id of f.viewIds ?? []) viewIds.add(id);
    for (const id of f.relationshipIds ?? []) relationshipIdsFromFolders.add(id);
  }

  const connectorIds = new Set<string>();
  const explicitRelationshipIds = new Set<string>();

  // Closure from included views.
  for (const vid of viewIds) {
    const v = model.views?.[vid];
    if (!v) continue;

    for (const n of v.layout?.nodes ?? []) {
      if (n.elementId) elementIds.add(n.elementId);
      if (n.connectorId) connectorIds.add(n.connectorId);
    }

    if (v.ownerRef?.id && model.elements?.[v.ownerRef.id]) {
      elementIds.add(v.ownerRef.id);
    }

    for (const c of v.connections ?? []) {
      if (c.relationshipId) explicitRelationshipIds.add(c.relationshipId);
      if (c.source.kind === 'connector') connectorIds.add(c.source.id);
      if (c.target.kind === 'connector') connectorIds.add(c.target.id);
    }

    for (const r of v.layout?.relationships ?? []) {
      if (r.relationshipId) explicitRelationshipIds.add(r.relationshipId);
    }
  }

  // Start with folder-provided relationships.
  for (const id of relationshipIdsFromFolders) explicitRelationshipIds.add(id);

  const relationships: Model['relationships'] = {};
  const finalRelationshipIds = new Set<string>();

  for (const rel of Object.values(model.relationships ?? {})) {
    const isExplicit = explicitRelationshipIds.has(rel.id);
    const srcOk = rel.sourceElementId ? elementIds.has(rel.sourceElementId) : false;
    const dstOk = rel.targetElementId ? elementIds.has(rel.targetElementId) : false;

    const usesConnectors = Boolean(rel.sourceConnectorId || rel.targetConnectorId);

    if (isExplicit || (!usesConnectors && srcOk && dstOk)) {
      relationships[rel.id] = rel;
      finalRelationshipIds.add(rel.id);
      if (rel.sourceConnectorId) connectorIds.add(rel.sourceConnectorId);
      if (rel.targetConnectorId) connectorIds.add(rel.targetConnectorId);
      // Ensure endpoints are included for explicit relationships.
      if (rel.sourceElementId) elementIds.add(rel.sourceElementId);
      if (rel.targetElementId) elementIds.add(rel.targetElementId);
    }
  }

  const elements: Model['elements'] = {};
  for (const id of elementIds) {
    const el = model.elements?.[id];
    if (el) elements[id] = el;
  }

  const views: Model['views'] = {};
  for (const id of viewIds) {
    const v = model.views?.[id];
    if (v) views[id] = v;
  }

  const connectors: Model['connectors'] | undefined = model.connectors
    ? Object.fromEntries(Object.entries(model.connectors).filter(([id]) => connectorIds.has(id)))
    : undefined;

  const folders = sliceFolders(model, includedFolderIds, elementIds, finalRelationshipIds, viewIds);

  return {
    ...model,
    elements,
    relationships,
    connectors,
    views,
    folders
  };
}
