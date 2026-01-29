import type { Key } from '@react-types/shared';

import type { Folder, Model } from '../../../domain';
import type { Selection } from '../selection';
import { formatElementTypeLabel } from '../../ui/typeLabels';
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
  return `${el.name || '(unnamed)'} (${formatElementTypeLabel(el)})`;
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

/**
 * Expands a single-child chain ("only one node at this level") starting from
 * the top-level nodes until a level is reached with 0 or >= 2 nodes.
 *
 * Example:
 * - If there is 1 top-level node A -> expand A
 * - If A has 1 child B -> expand B
 * - If B has 2 children -> stop (children are visible, but not expanded)
 */
export function expandSingleChildChain(treeData: NavNode[]): Set<Key> {
  const keys = new Set<Key>();
  let level: NavNode[] = treeData;

  while (level.length === 1) {
    const only = level[0]!;
    const children = only.children ?? [];
    if (children.length === 0) break;

    // Expand this node to reveal its children.
    keys.add(only.key);

    // If the next level branches (0 or >=2), stop after revealing it.
    if (children.length !== 1) break;

    level = children;
  }

  return keys;
}

/**
 * Expands a single-child chain starting from the given node key.
 *
 * Used to make expansion "smarter": if you expand a node and the next level has
 * only one node, we automatically keep expanding until a branching level (0 or
 * >= 2 nodes) is reached.
 */
export function expandSingleChildChainFromKey(treeData: NavNode[] | null, startKey: string): Set<Key> {
  if (!treeData) return new Set<Key>();
  const start = findNodeByKey(treeData, startKey);
  if (!start) return new Set<Key>();

  const keys = new Set<Key>();
  let cur: NavNode | null = start;
  while (cur) {
    const children: NavNode[] = cur.children ?? [];
    if (children.length === 0) break;

    keys.add(cur.key);

    if (children.length !== 1) break;
    cur = children[0] ?? null;
  }
  return keys;
}

/**
 * Collect all expandable node keys (nodes with children) within the subtree.
 * Useful when collapsing a node: we prune any expanded descendants.
 */
export function collectExpandableKeysInSubtree(root: NavNode): Set<Key> {
  const keys = new Set<Key>();
  const stack: NavNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    const children = n.children ?? [];
    if (children.length > 0) {
      keys.add(n.key);
      for (const c of children) stack.push(c);
    }
  }
  return keys;
}


export function collectNodeKeys(treeData: NavNode[]): Set<Key> {
  const keys = new Set<Key>();
  const stack: NavNode[] = [...treeData];
  while (stack.length) {
    const n = stack.pop()!;
    keys.add(n.key);
    if (n.children) stack.push(...n.children);
  }
  return keys;
}

export function findPathToKey(treeData: NavNode[] | null, targetKey: string): NavNode[] | null {
  if (!treeData) return null;
  // DFS with path tracking
  const stack: { node: NavNode; path: NavNode[] }[] = treeData.map((n) => ({ node: n, path: [n] }));
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.node.key === targetKey) return cur.path;
    const children = cur.node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i]!;
      stack.push({ node: child, path: [...cur.path, child] });
    }
  }
  return null;
}
