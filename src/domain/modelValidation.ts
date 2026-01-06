import type { Model, ViewLayout } from './types';

import { findDuplicateIds, getAllModelIds } from './validation';
import { validateRelationship as validateRelationshipRule } from './config/archimatePalette';
import { dedupeExternalIds, externalKey, normalizeExternalIdRef } from './externalIds';
import { normalizeKey, normalizeNs, validateTaggedValue } from './taggedValues';

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

function validateExternalIdsForTarget(
  list: unknown,
  target: ValidationIssueTarget,
  suffix: string,
  label: string
): ValidationIssue[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    return [
      makeIssue(
        'warning',
        `${label} externalIds is not an array and may be lost on save/load.`,
        target,
        `${suffix}:externalIds-not-array`
      )
    ];
  }

  const raw = list as unknown[];
  const normalized = raw.map((x) => normalizeExternalIdRef(x)).filter((x): x is NonNullable<typeof x> => !!x);
  const invalidCount = raw.length - normalized.length;

  // Detect duplicates among normalized refs
  const seen = new Set<string>();
  const dupKeys: string[] = [];
  for (const ref of normalized) {
    const k = externalKey(ref);
    if (seen.has(k)) dupKeys.push(k);
    else seen.add(k);
  }

  // dedupeExternalIds also normalizes+dedupes, used to detect whether we'd drop anything.
  const deduped = dedupeExternalIds(normalized);

  const issues: ValidationIssue[] = [];
  if (invalidCount > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has ${invalidCount} invalid external id entr${invalidCount === 1 ? 'y' : 'ies'} (missing system/id).`,
        target,
        `${suffix}:externalIds-invalid`
      )
    );
  }
  if (deduped.length !== normalized.length || dupKeys.length > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has duplicate external ids (system+id+scope). Only the last occurrence will be kept.`,
        target,
        `${suffix}:externalIds-duplicate`
      )
    );
  }

  return issues;
}

function validateTaggedValuesForTarget(
  list: unknown,
  target: ValidationIssueTarget,
  suffix: string,
  label: string
): ValidationIssue[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    return [
      makeIssue(
        'warning',
        `${label} taggedValues is not an array and may be lost on save/load.`,
        target,
        `${suffix}:taggedValues-not-array`
      )
    ];
  }

  const raw = list as unknown[];
  let invalidCount = 0;
  let warningCount = 0;

  // Collect a few representative messages for UI readability.
  const samples: string[] = [];

  for (const tv of raw) {
    if (!tv || typeof tv !== 'object') {
      invalidCount++;
      if (samples.length < 3) samples.push('(invalid entry)');
      continue;
    }

    // validateTaggedValue expects a TaggedValue-like object; it will normalize/validate defensively.
    const { normalized, errors, warnings } = validateTaggedValue(tv as any);

    if (errors.length > 0) {
      invalidCount++;
      if (samples.length < 3) {
        const ns = normalizeNs((normalized as any).ns);
        const key = normalizeKey((normalized as any).key);
        const name = `${ns ? ns + ':' : ''}${key || '(missing key)'}`;
        samples.push(`${name}: ${errors[0]}`);
      }
    } else if (warnings.length > 0) {
      warningCount++;
    }
  }

  const issues: ValidationIssue[] = [];
  if (invalidCount > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has ${invalidCount} invalid tagged value entr${invalidCount === 1 ? 'y' : 'ies'} (e.g. ${samples.join('; ')}).`,
        target,
        `${suffix}:taggedValues-invalid`
      )
    );
  } else if (warningCount > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has tagged values with warnings (e.g. very large values).`,
        target,
        `${suffix}:taggedValues-warning`
      )
    );
  }

  return issues;
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