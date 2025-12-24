import type { Model, ViewLayout } from './types';

import { findDuplicateIds, getAllModelIds } from './validation';
import { validateRelationship as validateRelationshipRule } from './config/archimatePalette';

export type ValidationIssueSeverity = 'error' | 'warning';

export type ValidationIssueTarget =
  | { kind: 'model' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'element'; elementId: string }
  | { kind: 'relationship'; relationshipId: string }
  | { kind: 'view'; viewId: string }
  | { kind: 'viewNode'; viewId: string; elementId: string };

export type ValidationIssue = {
  /** Stable-ish id for rendering in React lists. */
  id: string;
  severity: ValidationIssueSeverity;
  message: string;
  target: ValidationIssueTarget;
};

function makeIssue(
  severity: ValidationIssueSeverity,
  message: string,
  target: ValidationIssueTarget,
  suffix: string
): ValidationIssue {
  return {
    id: `${severity}:${target.kind}:${suffix}`,
    severity,
    message,
    target
  };
}

function listDuplicatesInLayout(layout: ViewLayout | undefined): {
  nodeElementIds: string[];
  relationshipIds: string[];
} {
  if (!layout) return { nodeElementIds: [], relationshipIds: [] };
  const nodeIds = layout.nodes.map((n) => n.elementId);
  const relIds = layout.relationships.map((r) => r.relationshipId);
  return {
    nodeElementIds: findDuplicateIds(nodeIds),
    relationshipIds: findDuplicateIds(relIds)
  };
}

export function validateModel(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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
    const source = model.elements[rel.sourceElementId];
    const target = model.elements[rel.targetElementId];

    if (!source) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing source element: ${rel.sourceElementId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-missing-source:${rel.id}`
        )
      );
    }
    if (!target) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing target element: ${rel.targetElementId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-missing-target:${rel.id}`
        )
      );
    }

    // Structural rule check (only meaningful if endpoints exist)
    if (source && target) {
      const result = validateRelationshipRule(source.type, target.type, rel.type);
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

    const nodeElementIds = layout.nodes.map((n) => n.elementId);
    const nodeSet = new Set(nodeElementIds);

    // Orphan nodes
    for (const n of layout.nodes) {
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
      if (!nodeSet.has(rel.sourceElementId) || !nodeSet.has(rel.targetElementId)) {
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
