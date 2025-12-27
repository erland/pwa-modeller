import type { Model } from '../types';

export type FolderOption = { id: string; label: string };

/**
 * Returns a stable list of folder options (id + human-readable path label),
 * starting at `rootId`, sorted alphabetically at each level.
 *
 * Label format: "Root / Child / Grandchild".
 */
export function gatherFolderOptions(model: Model, rootId: string): FolderOption[] {
  const out: FolderOption[] = [];

  function walk(folderId: string, prefix: string): void {
    const folder = model.folders[folderId];
    if (!folder) return;

    const label = prefix ? `${prefix} / ${folder.name}` : folder.name;
    out.push({ id: folderId, label });

    const children = folder.folderIds
      .map((id) => model.folders[id])
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    for (const c of children) walk(c.id, label);
  }

  walk(rootId, '');
  return out;
}

/**
 * Collects all folder ids in the subtree rooted at `folderId` (including itself).
 * Uses an explicit stack to avoid recursion depth issues.
 */
export function collectFolderSubtreeIds(model: Model, folderId: string): string[] {
  const out: string[] = [];
  const stack = [folderId];
  const visited = new Set<string>();

  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const f = model.folders[id];
    if (!f) continue;

    out.push(id);
    for (const childId of f.folderIds) stack.push(childId);
  }

  return out;
}
