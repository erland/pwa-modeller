import type { NavNode } from '../navigation/types';

/** Find a nav node by its id. Pure helper used by portal pages. */
export function findNavNodeById(nodes: NavNode[], nodeId: string): NavNode | null {
  for (const n of nodes) {
    if (n.id === nodeId) return n;
    const children = n.children;
    if (children && children.length) {
      const hit = findNavNodeById(children, nodeId);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Find the ancestor path to a node (excluding the node itself).
 * Returns an array of ancestor ids from root to parent.
 */
export function findPathToNavNode(nodes: NavNode[], nodeId: string): string[] | null {
  const path: string[] = [];

  function dfs(list: NavNode[]): boolean {
    for (const n of list) {
      if (n.id === nodeId) return true;
      const children = n.children;
      if (children && children.length) {
        path.push(n.id);
        const found = dfs(children);
        if (found) return true;
        path.pop();
      }
    }
    return false;
  }

  return dfs(nodes) ? path.slice() : null;
}
