import type { Folder, Model } from '../../../domain';

export function sortByName<T extends { name?: string }>(a: T, b: T): number {
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
}

export function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing folder kind: ${kind}`);
  return found;
}

export function scopeForFolder(
  model: Model,
  roots: { elementsRoot: Folder; viewsRoot: Folder },
  folderId: string
): 'elements' | 'views' | 'other' {
  const folder = model.folders[folderId];
  if (!folder) return 'other';

  // Cheap check: follow parents up to root and see which root we hit.
  let current: Folder | undefined = folder;
  while (current) {
    if (current.id === roots.elementsRoot.id) return 'elements';
    if (current.id === roots.viewsRoot.id) return 'views';
    if (!current.parentId) break;
    current = model.folders[current.parentId];
  }
  return 'other';
}
