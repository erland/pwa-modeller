import type { Key } from '@react-types/shared';

import type { Folder, Model } from '../../../domain';
import type { Selection } from '../selection';
import type { NavNode, NavNodeKind } from './types';

export function sortByName<T extends { name?: string }>(a: T, b: T): number {
  return (a?.name ?? '').localeCompare(b?.name ?? '', undefined, { sensitivity: 'base' });
}

export function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

export function makeKey(kind: NavNodeKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseKey(key: string): { kind: NavNodeKind; id: string } | null {
  const idx = key.indexOf(':');
  if (idx < 0) return null;
  const kind = key.slice(0, idx) as NavNodeKind;
  const id = key.slice(idx + 1);
  if (!id) return null;
  if (!['folder', 'element', 'view', 'relationship', 'section'].includes(kind)) return null;
  return { kind, id };
}

export function selectionToKey(selection: Selection): string | null {
  switch (selection.kind) {
    case 'folder':
      return makeKey('folder', selection.folderId);
    case 'element':
      return makeKey('element', selection.elementId);
    case 'relationship':
      return makeKey('relationship', selection.relationshipId);
    case 'view':
      return makeKey('view', selection.viewId);
    case 'viewNode':
      // In the navigator we highlight the parent view.
      return makeKey('view', selection.viewId);
    case 'viewObject':
      // View-only objects are not shown in the navigator; highlight the parent view.
      return makeKey('view', selection.viewId);
    case 'connector':
      // Connectors are not currently shown in the navigator.
      return null;
    case 'model':
    default:
      return null;
  }
}

export function makeSection(
  id: string,
  label: string,
  secondary: string,
  children: NavNode[],
  scope: NavNode['scope'] = 'other'
): NavNode {
  return {
    key: makeKey('section', id),
    kind: 'section',
    label,
    secondary,
    children,
    scope
  };
}

export function scopeForFolder(
  model: Model,
  roots: { elementsRoot: Folder; viewsRoot: Folder },
  folderId: string
): 'elements' | 'views' | 'other' {
  let cur: Folder | undefined = model.folders[folderId];
  while (cur) {
    if (cur.id === roots.elementsRoot.id) return 'elements';
    if (cur.id === roots.viewsRoot.id) return 'views';
    if (!cur.parentId) return 'other';
    cur = model.folders[cur.parentId];
  }
  return 'other';
}

export function elementOptionLabel(model: Model, elementId: string): string {
  const el = model.elements[elementId];
  if (!el) return elementId;
  return `${el.name || '(unnamed)'} (${el.type})`;
}

export function findNodeByKey(nodes: NavNode[] | null, key: string): NavNode | null {
  if (!nodes) return null;
  const stack: NavNode[] = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.key === key) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

export function expandAllWithChildren(treeData: NavNode[]): Set<Key> {
  const keys = new Set<Key>();
  const stack: NavNode[] = [...treeData];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.children && n.children.length > 0) {
      keys.add(n.key);
      stack.push(...n.children);
    }
  }
  return keys;
}
