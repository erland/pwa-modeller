import type { ApplyImportContext } from '../applyImportTypes';
import type { View, ViewNodeLayout, ViewObject, ViewObjectType, ViewRelationshipLayout } from '../../../domain';
import { createId, createView, createViewObject } from '../../../domain';
import { modelStore } from '../../../store';
import { pushWarning, resolveViewpointId, toExternalIds, toTaggedValues } from '../applyImportHelpers';

export function applyViews(ctx: ApplyImportContext): void {
  const { ir, sourceSystem, report, inferredViewKind, rootFolderId, mappings } = ctx;

  for (const v of ir.views ?? []) {
    if (!v?.id) continue;

    const internalId = createId('view');
    mappings.views[v.id] = internalId;

    const externalIds = toExternalIds(v.externalIds, sourceSystem, v.id);
    const taggedValues = toTaggedValues(v.taggedValues, sourceSystem);

    const viewpointId = resolveViewpointId(v.viewpoint);

    const view: View = {
      ...createView({
        id: internalId,
        name: v.name ?? 'View',
        kind: inferredViewKind,
        viewpointId,
        documentation: v.documentation
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
        modelStore.updateView(internalId, { layout: { nodes: existingNodes, relationships: relLayouts } });
      } catch (e) {
        pushWarning(report, `Failed to apply relationship routing in view "${v.name}": ${(e as Error).message}`);
      }
    }
  }
}
