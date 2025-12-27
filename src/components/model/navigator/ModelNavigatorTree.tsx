import type * as React from 'react';
import type { Key } from '@react-types/shared';
import {
  Tree,
  TreeItem,
  TreeItemContent
} from 'react-aria-components';

import type { Selection } from '../selection';
import type { NavNode } from './types';
import { NavigatorNodeRow } from './NavigatorNodeRow';

type Props = {
  treeData: NavNode[];
  selectedKey: string | null;
  expandedKeys: Set<Key>;
  setExpandedKeys: React.Dispatch<React.SetStateAction<Set<Key>>>;
  handleSelectionChange: (keys: unknown) => void;

  // Inline rename state
  editingKey: string | null;
  editingValue: string;
  setEditingValue: React.Dispatch<React.SetStateAction<string>>;
  editInputRef: React.RefObject<HTMLInputElement>;
  startEditing: (node: NavNode) => void;
  commitEditing: () => void;
  clearEditing: () => void;

  // Create actions
  selection: Selection;
  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string) => void;
  onRequestDeleteFolder: (folderId: string) => void;
  openCreateView: (targetFolderId?: string) => void;
  openCreateRelationship: (prefillSourceElementId?: string) => void;
};

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

export function ModelNavigatorTree({
  treeData,
  selectedKey,
  expandedKeys,
  setExpandedKeys,
  handleSelectionChange,
  editingKey,
  editingValue,
  setEditingValue,
  editInputRef,
  startEditing,
  commitEditing,
  clearEditing,
  selection,
  openCreateFolder,
  openCreateElement,
  onRequestDeleteFolder,
  openCreateView,
  openCreateRelationship
}: Props) {
  const toggleExpanded = (nodeKey: string) => {
    setExpandedKeys((prev) => toggleExpandedKey(prev, nodeKey));
  };

  function NavigatorTreeItem({ node, depth }: { node: NavNode; depth: number }) {
    const isEditing = editingKey === node.key;
    const icon = iconFor(node);
    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = hasChildren && expandedKeys.has(node.key);
    const showBadge = !!node.secondary && (node.kind === 'folder' || node.kind === 'section');
    const title = node.tooltip ?? node.label;

    return (
      <TreeItem id={node.key} textValue={node.label} key={node.key}>
        <TreeItemContent>
          <NavigatorNodeRow
            node={node}
            depth={depth}
            icon={icon}
            title={title}
            showBadge={showBadge}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            handleSelectionChange={handleSelectionChange}
            toggleExpanded={toggleExpanded}
            isEditing={isEditing}
            editingValue={editingValue}
            setEditingValue={setEditingValue}
            editInputRef={editInputRef}
            startEditing={startEditing}
            commitEditing={commitEditing}
            clearEditing={clearEditing}
            selection={selection}
            openCreateFolder={openCreateFolder}
            openCreateElement={openCreateElement}
            openCreateView={openCreateView}
            openCreateRelationship={openCreateRelationship}
            onRequestDeleteFolder={onRequestDeleteFolder}
          />
        </TreeItemContent>

        {hasChildren
          ? node.children!.map((c) => (
              <NavigatorTreeItem node={c} depth={depth + 1} key={c.key} />
            ))
          : null}
      </TreeItem>
    );
  }

  return (
    <Tree
      aria-label="Model navigator"
      selectionMode="single"
      // Keep selection controlled by the Workspace selection state.
      selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
      onSelectionChange={handleSelectionChange}
      expandedKeys={expandedKeys}
      onExpandedChange={(keys) => setExpandedKeys(new Set(keys as Iterable<Key>))}
      className="navAriaTree"
      renderEmptyState={() => <div className="navEmpty">No items</div>}
    >
      {treeData.map((n) => (
        <NavigatorTreeItem node={n} depth={0} key={n.key} />
      ))}
    </Tree>
  );
}
