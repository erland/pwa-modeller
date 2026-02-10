import type { ApplyImportContext } from '../applyImportTypes';
import type { Ref, View, ViewNodeLayout, ViewObject, ViewObjectType, ViewRelationshipLayout } from '../../../domain';
import { createId, createView, createViewObject, materializeViewConnectionsForView } from '../../../domain';
import { modelStore } from '../../../store';
import { pushWarning, resolveViewpointId, toExternalIds, toTaggedValues } from '../applyImportHelpers';
import { fixViewZOrder } from '../postprocess/fixViewZOrder';

export function applyViews(ctx: ApplyImportContext): void {
  const { ir, sourceSystem, report, inferredViewKind, rootFolderId, mappings } = ctx;

  for (const v of ir.views ?? []) {
    if (!v?.id) continue;

    const internalId = createId('view');
    mappings.views[v.id] = internalId;

    const externalIds = toExternalIds(v.externalIds, sourceSystem, v.id);
    const taggedValues = toTaggedValues(v.taggedValues, sourceSystem);

    const viewpointId = resolveViewpointId(v.viewpoint);

    // Optional view ownership (used e.g. by EA XMI imports where diagrams are nested under elements in the browser tree).
    // Importers may place an external element id in v.meta. We resolve it through mappings and set View.ownerRef.
    const metaOwner = v.meta && typeof v.meta === 'object' ? (v.meta as any).owningElementId : undefined;
    let ownerRef: Ref | undefined;
    if (typeof metaOwner === 'string' && metaOwner.trim()) {
      const internalOwner = mappings.elements[metaOwner.trim()];
      if (internalOwner) {
        const modelNow = modelStore.getState().model;
        const kind = modelNow?.elements[internalOwner]?.kind ?? inferredViewKind;
        ownerRef = { kind, id: internalOwner };
      }
    }

    const view: View = {
      ...createView({
        id: internalId,
        name: v.name ?? 'View',
        kind: inferredViewKind,
        viewpointId,
        documentation: v.documentation,
        ...(ownerRef ? { ownerRef } : {})
      }),
      externalIds,
      taggedValues
    };

    const folderId =
      v.folderId && typeof v.folderId === 'string' ? mappings.folders[v.folderId] ?? rootFolderId : rootFolderId;

    try {
      modelStore.addView(view, folderId);
    } catch (e) {
      pushWarning(report, `Failed to add view "${v.name ?? v.id}": ${(e as Error).message}`);
      continue;
    }

    // Nodes
    for (const n of v.nodes ?? []) {
      if (!n?.id) continue;

      const b = n.bounds;
      if (n.elementId) {
        const internalEl = mappings.elements[n.elementId];
        if (!internalEl) {
          pushWarning(report, `View "${v.name}" references missing element "${n.elementId}" (skipped node)`);
          continue;
        }

        try {
          modelStore.addElementToView(internalId, internalEl);
          if (b) {
            modelStore.updateViewNodeLayout(internalId, internalEl, {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              zIndex: n.meta?.zIndex as number | undefined
            });
          }
          mappings.viewNodes[n.id] = { kind: 'element', elementId: internalEl };
        } catch (e) {
          pushWarning(report, `Failed to add element node to view "${v.name}": ${(e as Error).message}`);
        }
        continue;
      }

      // View-local object node (Label/Note/GroupBox)
      const label = n.label?.trim();
      const kind = n.kind;

      // Importers may override via meta.objectType, otherwise derive from IR node kind.
      const override = n.meta?.objectType as ViewObjectType | undefined;
      const objType: ViewObjectType =
        override ??
        (kind === 'group'
          ? 'GroupBox'
          : kind === 'note'
            ? 'Note'
            : kind === 'shape' || kind === 'image'
              ? 'Label'
              : label
                ? 'Label'
                : 'Note');

      const obj: ViewObject = createViewObject({
        id: createId('obj'),
        type: objType,
        text: label || undefined
      });

      const nodeLayout: ViewNodeLayout | undefined = b
        ? {
            objectId: obj.id,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            zIndex: n.meta?.zIndex as number | undefined
          }
        : undefined;

      try {
        modelStore.addViewObject(internalId, obj, nodeLayout);
        mappings.viewNodes[n.id] = { kind: 'object', objectId: obj.id };
      } catch (e) {
        pushWarning(report, `Failed to add view object node to view "${v.name}": ${(e as Error).message}`);
      }
    }

    // Connections (routing)
    const relLayouts: ViewRelationshipLayout[] = [];
    for (const c of v.connections ?? []) {
      if (!c?.id || !c.relationshipId) continue;
      const internalRel = mappings.relationships[c.relationshipId];
      if (!internalRel) {
        pushWarning(report, `View "${v.name}" references missing relationship "${c.relationshipId}" (skipped connection)`);
        continue;
      }
      relLayouts.push({
        relationshipId: internalRel,
        points: c.points?.map((p) => ({ x: p.x, y: p.y })),
        zIndex: (c.meta?.zIndex as number | undefined) ?? undefined
      });
    }

    if (relLayouts.length > 0) {
      try {
        const latest = modelStore.getState().model?.views[internalId];
        const existingNodes = latest?.layout?.nodes ?? [];
        // Import-time default: treat imported diagram connections as the authoritative set of
        // relationships that should be visible in this view. Without this, the default implicit
        // mode would render *all* model relationships whose endpoints exist in the view, which
        // often results in extra lines compared to the source tool's diagram.
        const explicitIds = Array.from(new Set(relLayouts.map((r) => r.relationshipId)));
        modelStore.updateView(internalId, {
          layout: { nodes: existingNodes, relationships: relLayouts },
          relationshipVisibility: { mode: 'explicit', relationshipIds: explicitIds }
        });

        // IMPORTANT: views may already have materialized connections from earlier node additions
        // (implicit mode). Now that we've set explicit relationship visibility, re-materialize
        // connections so the diagram does not keep rendering relationships that are not part of
        // the imported diagram.
        const latestModel = modelStore.getState().model;
        const latestView = latestModel?.views[internalId];
        if (latestModel && latestView) {
          const nextConnections = materializeViewConnectionsForView(latestModel, latestView);
          if (nextConnections !== latestView.connections) {
            modelStore.updateView(internalId, { connections: nextConnections });
          }
        }
      } catch (e) {
        pushWarning(report, `Failed to apply relationship routing in view "${v.name}": ${(e as Error).message}`);
      }
    }

    // Post-process: normalize node z-order to avoid large containers covering smaller nodes after import.
    try {
      const latestModel = modelStore.getState().model;
      const latestView = latestModel?.views[internalId];
      if (latestModel && latestView?.layout?.nodes?.length) {
        const fixedNodes = fixViewZOrder(latestModel, latestView);
        const existingRels = latestView.layout?.relationships ?? [];
        modelStore.updateView(internalId, { layout: { nodes: fixedNodes, relationships: existingRels } });
      }
    } catch (e) {
      pushWarning(report, `Failed to normalize z-order in view "${v.name}": ${(e as Error).message}`);
    }

  }
}
