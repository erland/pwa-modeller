import type { Element, Folder, Model, View } from '../../domain';
import type { ElementNode, FolderNode, NavNode, ViewNode } from './types';

export type BuildPortalNavTreeInput = {
  model: Model;

  /**
   * Root folder id to start from when building a hierarchical tree.
   * If omitted or not found, the builder falls back to a flat (virtual) grouping.
   */
  rootFolderId?: string | null;

  /**
   * Whether to include element nodes in the tree (may be large for big models).
   * Defaults to false.
   */
  includeElements?: boolean;
};

export function buildPortalNavTree(input: BuildPortalNavTreeInput): NavNode[] {
  const { model, rootFolderId, includeElements = false } = input;

  const folders = model.folders ?? {};
  const views = model.views ?? {};
  const elements = model.elements ?? {};

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  const byLabel = (a: { label: string }, b: { label: string }) => collator.compare(a.label, b.label);

  // Mirror the authoring workspace navigator behavior:
  // Views can be "owned" by an element via ownerRef. Those owned views are rendered nested under
  // their owning element (when elements are included in the tree).
  const ownedViewsByElementId = new Map<string, View[]>();
  if (includeElements) {
    for (const v of Object.values(views)) {
      const ownerElementId =
        v.ownerRef && v.ownerRef.kind === 'archimate' ? v.ownerRef.id : undefined;
      if (!ownerElementId) continue;
      const arr = ownedViewsByElementId.get(ownerElementId) ?? [];
      arr.push(v);
      ownedViewsByElementId.set(ownerElementId, arr);
    }
    for (const [k, arr] of ownedViewsByElementId.entries()) {
      arr.sort((a, b) => collator.compare((a.name ?? '').trim(), (b.name ?? '').trim()));
      ownedViewsByElementId.set(k, arr);
    }
  }

  function makeFolderNode(folder: Folder, children: NavNode[], isVirtual = false): FolderNode {
    return {
      id: `folder:${folder.id}`,
      kind: 'folder',
      label: folder.name || 'Folder',
      payloadRef: { folderId: folder.id },
      folderKind: folder.kind,
      parentFolderId: folder.parentId,
      isVirtual,
      children,
    };
  }

  function makeVirtualFolderNode(virtualId: string, label: string, children: NavNode[]): FolderNode {
    return {
      id: `folder:virtual:${virtualId}`,
      kind: 'folder',
      label,
      payloadRef: { virtualId },
      isVirtual: true,
      children,
    };
  }

  function makeViewNode(view: View, folderId?: string): ViewNode {
    const label = (view.name ?? '').trim() || 'Untitled view';
    return {
      id: `view:${view.id}`,
      kind: 'view',
      label,
      payloadRef: { viewId: view.id, folderId },
    };
  }

  function makeElementNode(element: Element, folderId?: string): ElementNode {
    const label = (element.name ?? '').trim() || 'Untitled element';
    const ownedViews = includeElements ? (ownedViewsByElementId.get(element.id) ?? []) : [];
    const ownedViewNodes: ViewNode[] = ownedViews.map((v) => makeViewNode(v, folderId));
    return {
      id: `element:${element.id}`,
      kind: 'element',
      label,
      payloadRef: { elementId: element.id, folderId },
      children: ownedViewNodes.length ? ownedViewNodes : undefined,
    };
  }

  function buildFromFolder(folderId: string, visited: Set<string>): FolderNode | null {
    const folder = folders[folderId];
    if (!folder) return null;
    if (visited.has(folderId)) {
      // Cycle protection – return the folder as a leaf.
      return makeFolderNode(folder, [], false);
    }
    visited.add(folderId);

    const childFolders = (folder.folderIds ?? [])
      .map((id) => buildFromFolder(id, visited))
      .filter((n): n is FolderNode => Boolean(n));

    const childViews = (folder.viewIds ?? [])
      .map((id) => views[id])
      .filter(Boolean)
      // Only show folder views that are not owned by an element.
      // (Owned views are rendered under their owning element.)
      .filter((v) => !includeElements || !v.ownerRef)
      .map((v) => makeViewNode(v, folder.id));

    const childElements = includeElements
      ? (folder.elementIds ?? [])
          .map((id) => elements[id])
          .filter(Boolean)
          .map((e) => makeElementNode(e, folder.id))
      : [];

    childFolders.sort(byLabel);
    childViews.sort(byLabel);
    childElements.sort(byLabel);

    const children: NavNode[] = [...childFolders, ...childViews, ...childElements];
    return makeFolderNode(folder, children, false);
  }

  const rootId = rootFolderId ?? null;
  if (rootId && folders[rootId]) {
    const root = buildFromFolder(rootId, new Set());
    if (!root) return [];

    // Mirror Model workspace UX: hide the technical Root container and show its direct children.
    if (folders[rootId]?.kind === 'root') return root.children ?? [];

    return [root];
  }

  // Fallback: no folder hierarchy available (or missing root). Use virtual groupings.
  const viewNodes: ViewNode[] = Object.values(views).map((v) => makeViewNode(v));
  viewNodes.sort(byLabel);

  const roots: NavNode[] = [makeVirtualFolderNode('views', 'Views', viewNodes)];

  if (includeElements) {
    const elementNodes: ElementNode[] = Object.values(elements).map((e) => makeElementNode(e));
    elementNodes.sort(byLabel);
    roots.push(makeVirtualFolderNode('elements', 'Elements', elementNodes));
  }

  return roots;
}
