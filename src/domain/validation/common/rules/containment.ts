import type { Model } from '../../../types';
import { buildElementParentFolderIndex } from '../../../indexes/paths';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Containment (nested elements) structural consistency:
 * - parentElementId references an existing element
 * - no self-parenting
 * - no containment cycles
 * - (warning) parent and child are stored in different folders (UI may not show nesting)
 */
export function validateCommonContainment(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const elementParentFolder = buildElementParentFolderIndex(model);

  // Helper: detect if `startId` is reachable by following parentElementId from `fromId`.
  const reaches = (fromId: string, startId: string): boolean => {
    const seen = new Set<string>();
    let cur = fromId;
    while (true) {
      if (cur === startId) return true;
      if (seen.has(cur)) return false; // already looping somewhere else
      seen.add(cur);
      const el = model.elements[cur];
      if (!el) return false;
      const next = el.parentElementId;
      if (!next) return false;
      cur = next;
    }
  };

  for (const el of Object.values(model.elements)) {
    const parentId = el.parentElementId;
    if (!parentId) continue;

    if (parentId === el.id) {
      issues.push(
        makeIssue(
          'error',
          `Element ${el.name} (${el.id}) cannot have itself as parent (parentElementId).`,
          { kind: 'element', elementId: el.id },
          `containment-self-parent:${el.id}`
        )
      );
      continue;
    }

    const parent = model.elements[parentId];
    if (!parent) {
      issues.push(
        makeIssue(
          'error',
          `Element ${el.name} (${el.id}) references missing parent element: ${parentId}`,
          { kind: 'element', elementId: el.id },
          `containment-missing-parent:${el.id}`
        )
      );
      continue;
    }

    // Cycle check: if parent chain from parentId reaches the child, we have a cycle.
    if (reaches(parentId, el.id)) {
      issues.push(
        makeIssue(
          'error',
          `Containment cycle detected: setting parent of ${el.name} (${el.id}) to ${parent.name} (${parent.id}) creates a cycle.`,
          { kind: 'element', elementId: el.id },
          `containment-cycle:${el.id}`
        )
      );
    }

    // Cross-folder nesting warning (UI limitation, still a valid model).
    const childFolderId = elementParentFolder.get(el.id);
    const parentFolderId = elementParentFolder.get(parentId);
    if (childFolderId && parentFolderId && childFolderId !== parentFolderId) {
      issues.push(
        makeIssue(
          'warning',
          `Element ${el.name} (${el.id}) is nested under ${parent.name} (${parent.id}) but they are stored in different folders (${childFolderId} vs ${parentFolderId}). The navigator may not display this nesting.`,
          { kind: 'element', elementId: el.id },
          `containment-cross-folder:${el.id}`
        )
      );
    }
  }

  return issues;
}
