import type { Model } from '../types';
import type { RelationshipValidationMode } from '../relationshipValidationMode';
import { findDuplicateIds, getAllModelIds } from '../validation';
import { validateRelationship as validateRelationshipRule } from '../config/archimatePalette';
import { makeIssue } from './issues';
import type { ValidationIssue } from './types';
import { listDuplicatesInLayout } from './layout';
import { validateExternalIdsForTarget, validateTaggedValuesForTarget } from './externalMetadata';

export function validateModel(model: Model, relationshipValidationMode: RelationshipValidationMode = 'minimal'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
// ------------------------------
// Schema / extension validation (externalIds + taggedValues)
issues.push(...validateExternalIdsForTarget((model as any).externalIds, { kind: 'model' }, 'model', 'Model'));
issues.push(...validateTaggedValuesForTarget((model as any).taggedValues, { kind: 'model' }, 'model', 'Model'));

for (const folder of Object.values(model.folders)) {
  const label = `Folder ${folder.name} (${folder.id})`;
  issues.push(
    ...validateExternalIdsForTarget((folder as any).externalIds, { kind: 'folder', folderId: folder.id }, `folder:${folder.id}`, label)
  );
  issues.push(
    ...validateTaggedValuesForTarget((folder as any).taggedValues, { kind: 'folder', folderId: folder.id }, `folder:${folder.id}`, label)
  );
}

  // ------------------------------
  // Connector validation (existence + extension fields)
  // ------------------------------
  for (const c of Object.values(model.connectors ?? {})) {
    const label = `Connector ${c.type} (${c.id})`;
    issues.push(
      ...validateExternalIdsForTarget((c as any).externalIds, { kind: 'connector', connectorId: c.id }, `connector:${c.id}`, label)
    );
    issues.push(
      ...validateTaggedValuesForTarget((c as any).taggedValues, { kind: 'connector', connectorId: c.id }, `connector:${c.id}`, label)
    );
  }

  // ------------------------------
  // Cross-collection ID uniqueness
  // ------------------------------
  const allIds = getAllModelIds(model);
  const duplicates = findDuplicateIds(allIds);
  for (const id of duplicates) {
    issues.push(
      makeIssue(
        'error',
        `Duplicate id detected in model: ${id}`,
        { kind: 'model' },
        `dupe:${id}`
      )
    );
  }

  // ------------------------------
  // Relationship consistency + rules
  // ------------------------------
  for (const rel of Object.values(model.relationships)) {
    const hasSrcEl = !!rel.sourceElementId;
    const hasSrcCo = !!rel.sourceConnectorId;
    const hasTgtEl = !!rel.targetElementId;
    const hasTgtCo = !!rel.targetConnectorId;

    // Endpoint invariants
    if (hasSrcEl === hasSrcCo) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} must have exactly one source endpoint (element or connector).`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-src-endpoint-xor:${rel.id}`
        )
      );
    }
    if (hasTgtEl === hasTgtCo) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} must have exactly one target endpoint (element or connector).`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-tgt-endpoint-xor:${rel.id}`
        )
      );
    }

    const source = rel.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
    const target = rel.targetElementId ? model.elements[rel.targetElementId] : undefined;
    const sourceConnector = rel.sourceConnectorId ? (model.connectors ?? {})[rel.sourceConnectorId] : undefined;
    const targetConnector = rel.targetConnectorId ? (model.connectors ?? {})[rel.targetConnectorId] : undefined;

    if (rel.sourceElementId && !source) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing source element: ${rel.sourceElementId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-src-missing:${rel.id}`
        )
      );
    }
    if (rel.targetElementId && !target) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing target element: ${rel.targetElementId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-tgt-missing:${rel.id}`
        )
      );
    }

    if (rel.sourceConnectorId && !sourceConnector) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing source connector: ${rel.sourceConnectorId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-src-connector-missing:${rel.id}`
        )
      );
    }
    if (rel.targetConnectorId && !targetConnector) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing target connector: ${rel.targetConnectorId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-tgt-connector-missing:${rel.id}`
        )
      );
    }

    // Structural rule check (only meaningful for element-to-element relationships)
    if (source && target && !hasSrcCo && !hasTgtCo) {
      const result = validateRelationshipRule(source.type, target.type, rel.type, relationshipValidationMode);
      if (!result.allowed) {
        issues.push(
          makeIssue(
            'error',
            `Relationship ${rel.id} is not allowed: ${result.reason}`,
            { kind: 'relationship', relationshipId: rel.id },
            `rel-rule:${rel.id}`
          )
        );
      }
    }
  }

  // ------------------------------
  // Folder structural consistency
  // ------------------------------
  for (const folder of Object.values(model.folders)) {
    if (folder.parentId && !model.folders[folder.parentId]) {
      issues.push(
        makeIssue(
          'error',
          `Folder ${folder.name} (${folder.id}) references missing parent folder: ${folder.parentId}`,
          { kind: 'folder', folderId: folder.id },
          `folder-missing-parent:${folder.id}`
        )
      );
    }

    for (const childFolderId of folder.folderIds) {
      if (!model.folders[childFolderId]) {
        issues.push(
          makeIssue(
            'error',
            `Folder ${folder.name} (${folder.id}) references missing child folder: ${childFolderId}`,
            { kind: 'folder', folderId: folder.id },
            `folder-missing-child:${folder.id}:${childFolderId}`
          )
        );
      }
    }

    for (const elId of folder.elementIds) {
      if (!model.elements[elId]) {
        issues.push(
          makeIssue(
            'warning',
            `Folder ${folder.name} (${folder.id}) references missing element: ${elId}`,
            { kind: 'folder', folderId: folder.id },
            `folder-missing-el:${folder.id}:${elId}`
          )
        );
      }
    }

    for (const viewId of folder.viewIds) {
      if (!model.views[viewId]) {
        issues.push(
          makeIssue(
            'warning',
            `Folder ${folder.name} (${folder.id}) references missing view: ${viewId}`,
            { kind: 'folder', folderId: folder.id },
            `folder-missing-view:${folder.id}:${viewId}`
          )
        );
      }
    }
  }

  // ------------------------------
  // View layout consistency
  // ------------------------------
  for (const view of Object.values(model.views)) {
    const layout = view.layout;

    // Duplicate “diagram node ids” (elementId duplicates within a view)
    const dupes = listDuplicatesInLayout(layout);
    for (const elId of dupes.nodeElementIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate node for element: ${elId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-node:${view.id}:${elId}`
        )
      );
    }
    for (const cId of dupes.nodeConnectorIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate node for connector: ${cId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-connector-node:${view.id}:${cId}`
        )
      );
    }
    for (const objId of dupes.nodeObjectIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate node for view object: ${objId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-object-node:${view.id}:${objId}`
        )
      );
    }
    for (const relId of dupes.relationshipIds) {
      issues.push(
        makeIssue(
          'warning',
          `View ${view.name} (${view.id}) contains duplicate relationship reference: ${relId}`,
          { kind: 'view', viewId: view.id },
          `view-dupe-rel:${view.id}:${relId}`
        )
      );
    }

    if (!layout) continue;

    const nodeElementIds = layout.nodes.flatMap((n) => (n.elementId ? [n.elementId] : []));
    const nodeConnectorIds = layout.nodes.flatMap((n) => (n.connectorId ? [n.connectorId] : []));
    const nodeElementSet = new Set(nodeElementIds);
    const nodeConnectorSet = new Set(nodeConnectorIds);
    // Node layout invariants + orphan nodes
    for (const n of layout.nodes) {
      const hasEl = !!n.elementId;
      const hasCo = !!n.connectorId;
      const hasObj = !!n.objectId;

      const endpointCount = (hasEl ? 1 : 0) + (hasCo ? 1 : 0) + (hasObj ? 1 : 0);
      if (endpointCount !== 1) {
        issues.push(
          makeIssue(
            'error',
            `View ${view.name} (${view.id}) has an invalid node layout entry (must reference exactly one of elementId/connectorId/objectId).`,
            { kind: 'view', viewId: view.id },
            `view-node-xor:${view.id}:${(n.elementId ?? n.connectorId ?? n.objectId ?? 'unknown')}:${n.x},${n.y}`
          )
        );
        continue;
      }

      if (n.elementId) {
        if (!model.elements[n.elementId]) {
          issues.push(
            makeIssue(
              'warning',
              `View ${view.name} (${view.id}) contains a node for missing element: ${n.elementId}`,
              { kind: 'viewNode', viewId: view.id, elementId: n.elementId },
              `view-missing-node-el:${view.id}:${n.elementId}`
            )
          );
        }
      } else if (n.connectorId) {
        if (!(model.connectors ?? {})[n.connectorId]) {
          issues.push(
            makeIssue(
              'warning',
              `View ${view.name} (${view.id}) contains a node for missing connector: ${n.connectorId}`,
              { kind: 'view', viewId: view.id },
              `view-missing-node-connector:${view.id}:${n.connectorId}`
            )
          );
        }
      } else if (n.objectId) {
        if (!(view.objects ?? {})[n.objectId]) {
          issues.push(
            makeIssue(
              'warning',
              `View ${view.name} (${view.id}) contains a node for missing view object: ${n.objectId}`,
              { kind: 'view', viewId: view.id },
              `view-missing-node-object:${view.id}:${n.objectId}`
            )
          );
        }
      }
    }

    // Orphan relationship layout entries
    for (const r of layout.relationships) {
      const rel = model.relationships[r.relationshipId];
      if (!rel) {
        issues.push(
          makeIssue(
            'warning',
            `View ${view.name} (${view.id}) references missing relationship: ${r.relationshipId}`,
            { kind: 'view', viewId: view.id },
            `view-missing-rel:${view.id}:${r.relationshipId}`
          )
        );
        continue;
      }

      // If relationship exists but its endpoints are not present in the view nodes,
      // warn (diagram won't be able to render it meaningfully).
      const srcOk = rel.sourceElementId
        ? nodeElementSet.has(rel.sourceElementId)
        : rel.sourceConnectorId
          ? nodeConnectorSet.has(rel.sourceConnectorId)
          : false;
      const tgtOk = rel.targetElementId
        ? nodeElementSet.has(rel.targetElementId)
        : rel.targetConnectorId
          ? nodeConnectorSet.has(rel.targetConnectorId)
          : false;

      if (!srcOk || !tgtOk) {
        issues.push(
          makeIssue(
            'warning',
            `View ${view.name} (${view.id}) has relationship ${rel.id} but one or both endpoints are not in the view.`,
            { kind: 'view', viewId: view.id },
            `view-rel-missing-endpoints:${view.id}:${rel.id}`
          )
        );
      }
    }
  }

  // Keep deterministic ordering for tests/UI.
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
