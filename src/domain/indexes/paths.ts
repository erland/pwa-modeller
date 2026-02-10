import type { Folder, Model } from '../types';

/**
 * Lightweight indexes + path utilities used by UI/search components.
 *
 * These helpers are intentionally read-only and deterministic.
 */

export type FolderParentIndex = Map<string, string | null>; // folderId -> parent folderId (null for root)
export type ElementParentFolderIndex = Map<string, string>; // elementId -> folderId (first hit wins)

export type FolderPathOptions = {
  /** Whether to include the root folder name (e.g., "Model") in labels. Default: true. */
  includeRoot?: boolean;
};

/** Build folderId -> parentFolderId index. */
export function buildFolderParentIndex(model: Model): FolderParentIndex {
  const idx: FolderParentIndex = new Map();
  for (const f of Object.values(model.folders ?? {})) {
    idx.set(f.id, f.parentId ?? null);
  }
  return idx;
}

/** Build elementId -> folderId index by scanning folders (first write wins for stability). */
export function buildElementParentFolderIndex(model: Model): ElementParentFolderIndex {
  const idx: ElementParentFolderIndex = new Map();
  for (const f of Object.values(model.folders ?? {})) {
    for (const elId of f.elementIds ?? []) {
      if (!idx.has(elId)) idx.set(elId, f.id);
    }
  }
  return idx;
}

function isRootFolder(folder: Folder | undefined): boolean {
  return !!folder && folder.kind === 'root';
}

/**
 * Build a stable folder path label such as "Model / Custom / …".
 *
 * - Tolerates stale folder ids.
 * - Guards against cycles.
 */
export function getFolderPathLabel(
  model: Model,
  folderId: string,
  folderParent?: FolderParentIndex,
  options: FolderPathOptions = {}
): string {
  const includeRoot = options.includeRoot !== false;
  const start = model.folders?.[folderId];
  if (!start) return folderId;

  const parentIdx = folderParent ?? buildFolderParentIndex(model);

  const parts: string[] = [];
  const visited = new Set<string>();
  let cur: string | null | undefined = folderId;
  let guard = 0;

  while (cur && !visited.has(cur) && guard++ < 1000) {
    visited.add(cur);
    const f = model.folders?.[cur];
    if (!f) break;
    if (includeRoot || !isRootFolder(f)) parts.unshift(f.name);
    cur = parentIdx.get(cur) ?? null;
  }

  return parts.join(' / ');
}
