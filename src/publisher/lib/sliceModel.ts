import type { Model } from '../../domain';

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
    ? Object.fromEntries(
        Object.entries(model.connectors).filter(([id]) => connectorIds.has(id))
      )
    : undefined;

  // Preserve folders but filter memberships to included ids to avoid dangling references.
  const folders: Model['folders'] = {};
  for (const [fid, f] of Object.entries(model.folders ?? {})) {
    folders[fid] = {
      ...f,
      elementIds: (f.elementIds ?? []).filter((id) => elementIds.has(id)),
      relationshipIds: (f.relationshipIds ?? []).filter((id) => relationshipIds.has(id)),
      viewIds: (f.viewIds ?? []).filter((id) => id === viewId),
      folderIds: f.folderIds ?? []
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
