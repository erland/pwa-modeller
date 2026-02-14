import type * as React from 'react';
import type { Key } from '@react-types/shared';
import { TreeItem, TreeItemContent } from 'react-aria-components';

import type { NavNode } from './types';
import { iconForNode } from './iconForNode';
import { NavigatorNodeRow } from './NavigatorNodeRow';
import type { ModelKind } from '../../../domain';
import type { Selection } from '../selection';

type Props = {
  node: NavNode;
  depth: number;

  expandedKeys: Set<Key>;
  toggleExpanded: (nodeKey: string) => void;

  // Selection
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
  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string, kind?: ModelKind) => void;
  openCreateView: (opts?: { targetFolderId?: string; ownerElementId?: string; initialKind?: ModelKind }) => void;

  // Bubble selection changes (used by create actions that should auto-select the created item).
  onSelect: (selection: Selection) => void;
};

export function NavigatorTreeItem({
  node,
  depth,
  expandedKeys,
  toggleExpanded,
  handleSelectionChange,
  editingKey,
  editingValue,
  setEditingValue,
  editInputRef,
  startEditing,
  commitEditing,
  clearEditing,
  openCreateFolder,
  openCreateElement,
  openCreateView,
  onSelect
}: Props) {
  const isEditing = editingKey === node.key;
  const icon = iconForNode(node);
  const hasChildren = !!node.children && node.children.length > 0;
  const isExpanded = hasChildren && expandedKeys.has(node.key);
  // Keep tooltip simple: always show the full label (useful when the label is ellipsized).
  const title = node.label;

  return (
    <TreeItem id={node.key} textValue={node.label} key={node.key}>
      <TreeItemContent>
        <NavigatorNodeRow
          node={node}
          depth={depth}
          icon={icon}
          title={title}
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
          openCreateFolder={openCreateFolder}
          openCreateElement={openCreateElement}
          openCreateView={openCreateView}
          onSelect={onSelect}
        />
      </TreeItemContent>

      {hasChildren
        ? node.children!.map((c) => (
            <NavigatorTreeItem
              node={c}
              depth={depth + 1}
              key={c.key}
              expandedKeys={expandedKeys}
              toggleExpanded={toggleExpanded}
              handleSelectionChange={handleSelectionChange}
              editingKey={editingKey}
              editingValue={editingValue}
              setEditingValue={setEditingValue}
              editInputRef={editInputRef}
              startEditing={startEditing}
              commitEditing={commitEditing}
              clearEditing={clearEditing}
              openCreateFolder={openCreateFolder}
              openCreateElement={openCreateElement}
              openCreateView={openCreateView}
              onSelect={onSelect}
            />
          ))
        : null}
    </TreeItem>
  );
}
