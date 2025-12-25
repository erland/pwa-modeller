import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tree, TreeItem, TreeItemContent } from 'react-aria-components';
import type { Key } from '@react-types/shared';

import type { Folder, Model } from '../../domain';
import { modelStore, useModelStore } from '../../store';
import '../../styles/navigator.css';
import { FolderNameDialog } from './FolderNameDialog';
import type { Selection } from './selection';

type Props = {
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

type NavNodeKind = 'folder' | 'element' | 'view' | 'relationship' | 'section';
type NavNode = {
  key: string;
  kind: NavNodeKind;
  label: string;
  secondary?: string; // rendered as a compact badge (e.g. counts)
  tooltip?: string;
  children?: NavNode[];
  // Actions
  canCreateFolder?: boolean;
  canDelete?: boolean;
  canRename?: boolean;
  // IDs
  folderId?: string;
  elementId?: string;
  viewId?: string;
  relationshipId?: string;
};

function sortByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

function makeKey(kind: NavNodeKind, id: string): string {
  return `${kind}:${id}`;
}



function makeSection(id: string, label: string, secondary: string, children: NavNode[]): NavNode {
  return {
    key: makeKey('section', id),
    kind: 'section',
    label,
    secondary,
    children
  };
}
function parseKey(key: string): { kind: NavNodeKind; id: string } | null {
  const idx = key.indexOf(':');
  if (idx < 0) return null;
  const kind = key.slice(0, idx) as NavNodeKind;
  const id = key.slice(idx + 1);
  if (!id) return null;
  if (!['folder', 'element', 'view', 'relationship', 'section'].includes(kind)) return null;
  return { kind, id };
}

function selectionToKey(selection: Selection): string | null {
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
    case 'model':
    default:
      return null;
  }
}

function iconFor(node: NavNode): string {
  switch (node.kind) {
    case 'folder':
      return '📁';
    case 'view':
      return '🗺️';
    case 'element':
      return '⬛';
    case 'relationship':
      return '🔗';
    case 'section':
    default:
      return '▦';
  }
}

function toggleExpandedKey(current: Set<Key>, key: Key): Set<Key> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function ModelNavigator({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);
  const isDirty = useModelStore((s) => s.isDirty);
  const fileName = useModelStore((s) => s.fileName);

  const [searchQuery, setSearchQuery] = useState('');
  const searchTerm = searchQuery.trim().toLowerCase();

  const [createParentId, setCreateParentId] = useState<string | null>(null);

  // Expansion state (default: expand everything, keeps the tree explorer-like)
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());

  // Inline rename state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const roots = useMemo(() => {
    if (!model) return null;
    const elementsRoot = findFolderByKind(model, 'elements');
    const viewsRoot = findFolderByKind(model, 'views');
    return { elementsRoot, viewsRoot };
  }, [model]);

  const treeData = useMemo<NavNode[] | null>(() => {
    if (!model || !roots) return null;

    const buildFolder = (folderId: string, scope: 'elements' | 'views'): NavNode => {
      const folder = model.folders[folderId];
      const isRootFolder = folder.kind === 'elements' || folder.kind === 'views' || folder.kind === 'root';

      const childFolders = folder.folderIds.map((id) => model.folders[id]).filter(Boolean).sort(sortByName);
      const childFolderNodes = childFolders.map((f) => buildFolder(f.id, scope));

      const elementLeaves =
        scope === 'elements'
          ? folder.elementIds
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
              }))
          : [];

      const viewLeaves =
        scope === 'views'
          ? folder.viewIds
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
              }))
          : [];

      const children: NavNode[] = [...childFolderNodes, ...elementLeaves, ...viewLeaves];
      const immediateCount =
        childFolders.length + (scope === 'elements' ? folder.elementIds.length : folder.viewIds.length);

      return {
        key: makeKey('folder', folderId),
        kind: 'folder',
        label: folder.name,
        // keep the tree readable in a narrow sidebar: show a compact count badge
        secondary: String(immediateCount),
        tooltip:
          scope === 'elements'
            ? `${folder.name} — ${folder.elementIds.length} elements, ${childFolders.length} folders`
            : `${folder.name} — ${folder.viewIds.length} views, ${childFolders.length} folders`,
        children,
        folderId,
        canCreateFolder: true,
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
          // Keep the tree compact; full details are shown via tooltip + properties panel.
          relationshipId: r.id
        };
      });

    const rootsNodes: NavNode[] = [
      buildFolder(roots.elementsRoot.id, 'elements'),
      buildFolder(roots.viewsRoot.id, 'views'),
      {
        key: makeKey('section', 'relationships'),
        kind: 'section',
        label: 'Relationships',
        secondary: String(relationships.length),
        children: relationships
      }
    ];

    if (!searchTerm) return rootsNodes;

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
  }, [model, roots, searchTerm]);

  // Expand all nodes that have children when the tree data changes.
  // This keeps the navigator behaving like a typical explorer tree (open by default).
  useEffect(() => {
    if (!treeData) return;
    const keys = new Set<Key>();
    const stack: NavNode[] = [...treeData];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.children && n.children.length > 0) {
        keys.add(n.key);
        stack.push(...n.children);
      }
    }
    setExpandedKeys(keys);
  }, [model?.id, searchTerm, treeData]);

  const selectedKey = selectionToKey(selection);

  function clearEditing() {
    setEditingKey(null);
    setEditingValue('');
  }

  function startEditing(node: NavNode) {
    if (!node.canRename) return;
    setEditingKey(node.key);
    setEditingValue(node.label);
    // focus after next render
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  }

  function commitEditing() {
    if (!model) return;
    if (!editingKey) return;
    const nextName = editingValue.trim();
    if (!nextName) {
      clearEditing();
      return;
    }

    const parsed = parseKey(editingKey);
    if (!parsed) {
      clearEditing();
      return;
    }

    try {
      if (parsed.kind === 'folder') {
        modelStore.renameFolder(parsed.id, nextName);
      } else if (parsed.kind === 'element') {
        modelStore.updateElement(parsed.id, { name: nextName });
      } else if (parsed.kind === 'view') {
        modelStore.updateView(parsed.id, { name: nextName });
      }
    } catch {
      // If rename fails (e.g. root folder), just exit edit mode.
    } finally {
      clearEditing();
    }
  }

  function handleSelectionChange(keys: unknown) {
    // react-aria-components uses Set<Key> for single selection.
    const set = keys as Set<Key>;
    const first = set?.values?.().next?.().value as string | undefined;
    if (!first) {
      onSelect({ kind: 'model' });
      return;
    }
    const parsed = parseKey(first);
    if (!parsed) {
      onSelect({ kind: 'model' });
      return;
    }
    switch (parsed.kind) {
      case 'folder':
        onSelect({ kind: 'folder', folderId: parsed.id });
        return;
      case 'element':
        onSelect({ kind: 'element', elementId: parsed.id });
        return;
      case 'view':
        onSelect({ kind: 'view', viewId: parsed.id });
        return;
      case 'relationship':
        onSelect({ kind: 'relationship', relationshipId: parsed.id });
        return;
      case 'section':
      default:
        onSelect({ kind: 'model' });
        return;
    }
  }

  function findNodeByKey(nodes: NavNode[] | null, key: string): NavNode | null {
    if (!nodes) return null;
    const stack: NavNode[] = [...nodes];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.key === key) return n;
      if (n.children) stack.push(...n.children);
    }
    return null;
  }

  if (!model || !roots || !treeData) {
    return (
      <div className="navigator">
        <div className="navigatorHeader">
          <div className="navigatorModelName">No model loaded</div>
          <div className="navigatorMeta">Use New/Open in the header to begin.</div>
        </div>
      </div>
    );
  }

  function renderNode(node: NavNode, depth = 0): React.ReactNode {
    const isEditing = editingKey === node.key;
    const icon = iconFor(node);
    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = hasChildren && expandedKeys.has(node.key);
    const showBadge = !!node.secondary && (node.kind === 'folder' || node.kind === 'section');
    const title = node.tooltip ?? node.label;

    const actions = (
      <span className="navTreeActions" aria-label="Node actions">
        {node.canCreateFolder && node.folderId ? (
          <button
            type="button"
            className="miniButton"
            aria-label="Create folder"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setCreateParentId(node.folderId!);
            }}
          >
            ＋
          </button>
        ) : null}

        {node.canRename ? (
          <button
            type="button"
            className="miniButton"
            aria-label="Rename"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              startEditing(node);
            }}
          >
            ✎
          </button>
        ) : null}

        {node.canDelete && node.folderId ? (
          <button
            type="button"
            className="miniButton"
            aria-label="Delete folder"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              const ok = window.confirm('Delete this folder? Contents will be moved to its parent folder.');
              if (!ok) return;
              modelStore.deleteFolder(node.folderId!);
              if (selection.kind === 'folder' && selection.folderId === node.folderId) {
                onSelect({ kind: 'model' });
              }
            }}
          >
            🗑
          </button>
        ) : null}
      </span>
    );

    return (
      <TreeItem id={node.key} textValue={node.label} key={node.key}>
        <TreeItemContent>
          <div
            className="navTreeRow"
            data-kind={node.kind}
            data-nodekey={node.key}
            title={title}
            onClick={(e: React.MouseEvent) => {
                          const target = e.target as HTMLElement | null;
                          if (target && target.closest('[data-chevron="1"]')) {
                            return;
                          }
              // Ensure mouse click selects the item (Explorer/Finder behavior).
              e.preventDefault();
              e.stopPropagation();
              handleSelectionChange(new Set([node.key]));
            }}
            onDoubleClick={(e: React.MouseEvent) => {
              if (!hasChildren && !node.canRename) return;
              e.preventDefault();
              e.stopPropagation();
              if (hasChildren) {
                setExpandedKeys((prev) => toggleExpandedKey(prev, node.key));
              } else {
                startEditing(node);
              }
            }}
          >
            {depth > 0 ? (
              <>
                <span className="navTreeIndent" aria-hidden style={{ width: depth * 14 }} />
                <span className="navTreeConnector" aria-hidden />
              </>
            ) : null}

            {hasChildren ? (
              // React Aria requires an explicit chevron button for expandable items for accessibility.
              // See: Tree docs "Collapse and expand button".
              <Button
                slot="chevron"
                className="navTreeChevronButton"
                data-chevron="1"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                <span className="navTreeChevron" aria-hidden>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </Button>
            ) : (
              <span className="navTreeChevronSpacer" aria-hidden />
            )}

            <span className="navTreeIcon" aria-hidden>
              {icon}
            </span>

            {isEditing ? (
              <input
                ref={editInputRef}
                className="textInput navInlineRename"
                aria-label="Rename"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEditing();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    clearEditing();
                  }
                }}
                onBlur={() => commitEditing()}
              />
            ) : (
              <span className="navTreeLabel">{node.label}</span>
            )}

            {showBadge ? <span className="navTreeSecondary">{node.secondary}</span> : null}
            {actions}
          </div>
        </TreeItemContent>

        {hasChildren ? node.children!.map((c) => renderNode(c, depth + 1)) : null}
      </TreeItem>
    );
  }

  return (
    <div className="navigator">
      <div className="navigatorHeader">
        <div className="navigatorModelName">
          {model.metadata.name}
          {isDirty ? ' *' : ''}
        </div>
        <div className="navigatorMeta">{fileName ? `File: ${fileName}` : 'Not saved yet'}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input
            className="textInput"
            aria-label="Search model"
            placeholder="Search elements, relationships, views…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.trim() && (
            <button type="button" className="miniButton" aria-label="Clear model search" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>
        <p className="navHint">Tip: Click to select, use ←/→ to collapse/expand, and F2 (or ✎) to rename.</p>
      </div>

      
<div
  className="navTreeWrap"
  onKeyDown={(e) => {
    if (e.key === 'F2') {
      const key = selectedKey;
      if (!key) return;
      const node = findNodeByKey(treeData, key);
      if (node) startEditing(node);
    }
  }}
>
      <Tree
        aria-label="Model navigator"
        selectionMode="single"
        // Keep selection controlled by the Workspace selection state.
        selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
        onSelectionChange={handleSelectionChange}
        expandedKeys={expandedKeys}
        onExpandedChange={(keys) => setExpandedKeys(new Set(keys as Iterable<Key>))}
        className="navAriaTree"
        renderEmptyState={() => <div className="navEmpty">No items</div>}      >
        {treeData.map((n) => renderNode(n, 0))}
      </Tree>
      </div>

      <FolderNameDialog
        isOpen={createParentId !== null}
        title="Create folder"
        confirmLabel="Create"
        onCancel={() => setCreateParentId(null)}
        onConfirm={(name) => {
          if (!createParentId) return;
          modelStore.createFolder(createParentId, name);
          setCreateParentId(null);
        }}
      />
    </div>
  );
}