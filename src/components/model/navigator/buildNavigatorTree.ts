import type { Model } from '../../../domain';

import type { NavNode } from './types';
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

  const buildFolder = (folderId: string): NavNode => {
    const folder = model.folders[folderId];
    const isRootFolder = folder.kind === 'root';

    const childFolders = folder.folderIds.map((id) => model.folders[id]).filter(Boolean).sort(sortByName);
    const childFolderNodes = childFolders.map((f) => buildFolder(f.id));

    const elementLeaves = folder.elementIds
      .map((id) => model.elements[id])
      .filter(Boolean)
      .sort(sortByName)
      .map<NavNode>((el) => ({
        key: makeKey('element', el.id),
        kind: 'element',
        label: el.name || '(unnamed)',
        tooltip: `${el.name || '(unnamed)'} (${el.type})`,
        canRename: true,
        elementId: el.id
      }));

    const viewLeaves = folder.viewIds
      .map((id) => model.views[id])
      .filter(Boolean)
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
    const immediateCount = childFolders.length + folder.elementIds.length + folder.viewIds.length;

    return {
      key: makeKey('folder', folderId),
      kind: 'folder',
      label: folder.name,
      secondary: String(immediateCount),
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

  const relationships = Object.values(model.relationships)
    .filter(Boolean)
    .sort((a, b) => {
      const byType = a.type.localeCompare(b.type, undefined, { sensitivity: 'base' });
      if (byType !== 0) return byType;
      return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
    })
    .map<NavNode>((r) => {
      const src = model.elements[r.sourceElementId]?.name ?? r.sourceElementId;
      const tgt = model.elements[r.targetElementId]?.name ?? r.targetElementId;
      const label = r.name ? `${r.type}: ${r.name}` : r.type;
      return {
        key: makeKey('relationship', r.id),
        kind: 'relationship',
        label,
        tooltip: `${label} — ${src} → ${tgt}`,
        relationshipId: r.id
      };
    });

  const rootNodes: NavNode[] = [
    buildFolder(rootFolderId),
    {
      ...makeSection('relationships', 'Relationships', String(relationships.length), relationships, 'relationships'),
      canCreateRelationship: true
    }
  ];

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
      tooltip: `${el.name || '(unnamed)'} (${el.type})`,
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

  const rels = Object.values(model.relationships)
    .filter((r) => match(r.name) || match(r.type))
    .slice(0, 30)
    .map<NavNode>((r) => {
      const src = model.elements[r.sourceElementId]?.name ?? r.sourceElementId;
      const tgt = model.elements[r.targetElementId]?.name ?? r.targetElementId;
      const label = r.name ? `${r.type}: ${r.name}` : r.type;
      return {
        key: makeKey('relationship', r.id),
        kind: 'relationship',
        label,
        tooltip: `${label} — ${src} → ${tgt}`,
        relationshipId: r.id
      };
    });

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
      String(elements.length + views.length + rels.length + folders.length),
      [
        ...(elements.length ? [makeSection('search-elements', 'Elements', String(elements.length), elements)] : []),
        ...(views.length ? [makeSection('search-views', 'Views', String(views.length), views)] : []),
        ...(rels.length ? [makeSection('search-relationships', 'Relationships', String(rels.length), rels)] : []),
        ...(folders.length ? [makeSection('search-folders', 'Folders', String(folders.length), folders)] : [])
      ]
    )
  ];
}
