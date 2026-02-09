import type { Model } from '../../domain';

export type PortalNavSource =
  | { kind: 'folders'; rootFolderId: string; reason: string }
  | { kind: 'flat'; reason: string };

/**
 * Step 1 — Inventory + choose the data source for the portal navigation tree.
 *
 * Decision:
 * - Prefer the same structure as the Model workspace navigator: use the Model's folder hierarchy as the backbone.
 * - This preserves familiar grouping (folders → subfolders → elements/views) and matches how authors organize content.
 *
 * Fallback:
 * - If the published bundle has no folders (unexpected), fall back to a flat view (elements/views) in later steps.
 */
export function choosePortalNavSource(model: Model | null): PortalNavSource {
  if (!model) return { kind: 'flat', reason: 'No model loaded' };

  const folders = Object.values(model.folders ?? {});
  if (!folders.length) {
    return { kind: 'flat', reason: 'Model contains no folders' };
  }

  const root = folders.find((f) => f.kind === 'root');
  if (root) {
    return { kind: 'folders', rootFolderId: root.id, reason: 'Using folder hierarchy (root folder present)' };
  }

  // Older or unusual models might not have a root container. Pick a stable-ish candidate.
  // Prefer an explicit top-level (no parent) if present, otherwise first folder.
  const topLevel = folders.find((f) => !f.parentId) ?? folders[0];
  return { kind: 'folders', rootFolderId: topLevel.id, reason: 'No root folder; using first top-level folder' };
}

export function getPortalRootFolderId(model: Model | null): string | null {
  const src = choosePortalNavSource(model);
  return src.kind === 'folders' ? src.rootFolderId : null;
}
