import type { Model } from '../../../domain';

import type { NavNode } from './types';
import { formatElementTypeLabel } from '../../ui/typeLabels';
import {
  makeKey,
  makeSection,
  sortByName
} from './navUtils';

export function buildNavigatorTreeData(args: {
  model: Model;
  rootFolderId: string;
  searchTerm: string;
}): NavNode[] {
  const { model, rootFolderId, searchTerm } = args;

  // Precompute views that are owned by elements so we can render them nested under elements in the tree.
  // Views can be owned by elements via ownerRef.
  const ownedViewsByElementId = new Map<string, { id: string; name: string; viewpointId: string }[]>();
  for (const v of Object.values(model.views)) {
    const ownerElementId =
      v.ownerRef && v.ownerRef.kind === 'archimate' ? v.ownerRef.id : undefined;
    if (!ownerElementId) continue;
    const arr = ownedViewsByElementId.get(ownerElementId) ?? [];
    arr.push({ id: v.id, name: v.name || '(unnamed)', viewpointId: v.viewpointId });
    ownedViewsByElementId.set(ownerElementId, arr);
  }
  for (const [k, arr] of ownedViewsByElementId.entries()) {
    arr.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }));
    ownedViewsByElementId.set(k, arr);
  }

  const buildFolder = (folderId: string): NavNode => {
    const folder = model.folders[folderId];
    const isRootFolder = folder.kind === 'root';

    const childFolders = folder.folderIds.map((id) => model.folders[id]).filter(Boolean).sort(sortByName);
    const childFolderNodes = childFolders.map((f) => buildFolder(f.id));

    // Elements can be semantically nested (containment) via element.parentElementId.
    // Containment is independent of folders, but for the navigator tree we only nest
    // elements that are *also* listed in this folder. If an element points to a parent
    // element in a different folder, we treat it as a top-level element in this folder.
    const elementIdsInFolder = new Set(folder.elementIds);
    const childElementIdsByParentId = new Map<string | null, string[]>();
    for (const elId of folder.elementIds) {
      const el = model.elements[elId];
      if (!el) continue;
      const maybeParentId = el.parentElementId ?? null;
      const parentId = maybeParentId && elementIdsInFolder.has(maybeParentId) ? maybeParentId : null;
      const arr = childElementIdsByParentId.get(parentId) ?? [];
      arr.push(elId);
      childElementIdsByParentId.set(parentId, arr);
    }
    for (const [k, arr] of childElementIdsByParentId.entries()) {
      arr.sort((a, b) => {
        const ea = model.elements[a];
        const eb = model.elements[b];
        return sortByName(ea, eb);
      });
      childElementIdsByParentId.set(k, arr);
    }

    const buildElementNode = (elementId: string): NavNode => {
      const el = model.elements[elementId];
      if (!el) {
        return {
          key: makeKey('element', elementId),
          kind: 'element',
          label: '(missing)',
          tooltip: '(missing)',
          elementId: elementId
        };
      }

      const owned = ownedViewsByElementId.get(el.id) ?? [];
      const ownedViewNodes: NavNode[] = owned.map((v) => ({
        key: makeKey('view', v.id),
        kind: 'view',
        label: v.name || '(unnamed)',
        tooltip: `${v.name || '(unnamed)'} (${v.viewpointId})`,
        canRename: true,
        viewId: v.id
      }));

      const childElementIds = childElementIdsByParentId.get(el.id) ?? [];
      const childElementNodes = childElementIds.map((id) => buildElementNode(id));

      const children: NavNode[] = [...childElementNodes, ...ownedViewNodes];

      return {
        key: makeKey('element', el.id),
        kind: 'element',
        label: el.name || '(unnamed)',
        tooltip: `${el.name || '(unnamed)'} (${formatElementTypeLabel(el)})`,
        canRename: true,
        canCreateCenteredView: true,
        children: children.length ? children : undefined,
        elementId: el.id
      };
    };

    const elementLeaves = (childElementIdsByParentId.get(null) ?? []).map((id) => buildElementNode(id));

    const viewLeaves = folder.viewIds
      .map((id) => model.views[id])
      .filter((v) => {
        if (!v) return false;
        // Only show folder views that are not owned by an element.
        // (Owned views are rendered under their owning element.)
        return !v.ownerRef;
      })
      .sort(sortByName)
      .map<NavNode>((v) => ({
        key: makeKey('view', v.id),
        kind: 'view',
        label: v.name || '(unnamed)',
        tooltip: `${v.name || '(unnamed)'} (${v.viewpointId})`,
        canRename: true,
        viewId: v.id
      }));

    const children: NavNode[] = [...childFolderNodes, ...elementLeaves, ...viewLeaves];

    return {
      key: makeKey('folder', folderId),
      kind: 'folder',
      label: folder.name,
      tooltip:
        `${folder.name} — ${folder.elementIds.length} element(s), ${folder.viewIds.length} view(s), ${childFolders.length} folder(s)`,
      children,
      folderId,
      canCreateFolder: true,
      canCreateElement: true,
      canCreateView: true,
      canRename: !isRootFolder,
      canDelete: !isRootFolder
    };
  };

  // Relationships are intentionally not shown in the navigator tree.
  const rootFolderNode = buildFolder(rootFolderId);
  // Hide the technical Root container in the UI: show its direct children as top-level nodes.
  // The underlying model still keeps the root folder for migrations and organization.
  const rootNodes: NavNode[] =
    model.folders[rootFolderId]?.kind === 'root'
      ? (rootFolderNode.children ?? [])
      : [rootFolderNode];

  if (!searchTerm) return rootNodes;

  const match = (text: string | undefined | null) => (text ?? '').toLowerCase().includes(searchTerm);

  const elements = Object.values(model.elements)
    .filter((el) => match(el.name) || match(el.type))
    .sort(sortByName)
    .slice(0, 30)
    .map<NavNode>((el) => ({
      key: makeKey('element', el.id),
      kind: 'element',
      label: el.name || '(unnamed)',
      tooltip: `${el.name || '(unnamed)'} (${formatElementTypeLabel(el)})`,
      canRename: true,
      elementId: el.id
    }));

  const views = Object.values(model.views)
    .filter((v) => match(v.name) || match(v.viewpointId))
    .sort(sortByName)
    .slice(0, 30)
    .map<NavNode>((v) => ({
      key: makeKey('view', v.id),
      kind: 'view',
      label: v.name || '(unnamed)',
      tooltip: `${v.name || '(unnamed)'} (${v.viewpointId})`,
      canRename: true,
      viewId: v.id
    }));

  const folders = Object.values(model.folders)
    .filter((f) => match(f.name) || match(f.kind))
    .sort(sortByName)
    .slice(0, 30)
    .map<NavNode>((f) => ({
      key: makeKey('folder', f.id),
      kind: 'folder',
      label: f.name,
      tooltip: `${f.name} (folder)`,
      folderId: f.id
    }));

  return [
    makeSection(
      'search',
      'Search results',
      '',
      [
        ...(elements.length ? [makeSection('search-elements', 'Elements', '', elements)] : []),
        ...(views.length ? [makeSection('search-views', 'Views', '', views)] : []),
        ...(folders.length ? [makeSection('search-folders', 'Folders', '', folders)] : [])
      ]
    )
  ];
}
