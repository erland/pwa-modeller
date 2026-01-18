import { useRef } from 'react';
import type * as React from 'react';
import type { Key } from '@react-types/shared';
import { Tree } from 'react-aria-components';

import type { NavNode } from './types';
import { NavigatorTreeItem } from './NavigatorTreeItem';
import type { ModelKind } from '../../../domain';
import { useNavigatorTreeDnd } from './useNavigatorTreeDnd';

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
  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string, kind?: ModelKind) => void;
  openCreateView: (opts?: { targetFolderId?: string; ownerElementId?: string; initialKind?: ModelKind }) => void;

  /** Optional handler: move an element to a folder when dropped on a folder in the tree. */
  onMoveElementToFolder?: (elementId: string, targetFolderId: string) => void;
  /** Optional handler: move a view to a folder when dropped on a folder in the tree. */
  onMoveViewToFolder?: (viewId: string, targetFolderId: string) => void;
  /** Optional handler: center a view under an element when dropped on an element in the tree. */
  onMoveViewToElement?: (viewId: string, targetElementId: string) => void;
  /** Optional handler: move a folder under another folder when dropped on a folder in the tree. */
  onMoveFolderToFolder?: (folderId: string, targetFolderId: string) => void;
};

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
  openCreateFolder,
  openCreateElement,
  openCreateView,
  onMoveElementToFolder,
  onMoveViewToFolder,
  onMoveViewToElement,
  onMoveFolderToFolder
}: Props) {
  const treeWrapRef = useRef<HTMLDivElement | null>(null);

  useNavigatorTreeDnd({
    treeWrapRef,
    onMoveElementToFolder,
    onMoveViewToFolder,
    onMoveViewToElement,
    onMoveFolderToFolder
  });

  const toggleExpanded = (nodeKey: string) => {
    setExpandedKeys((prev) => toggleExpandedKey(prev, nodeKey));
  };

  return (
    <div ref={treeWrapRef}>
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
          <NavigatorTreeItem
            node={n}
            depth={0}
            key={n.key}
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
          />
        ))}
      </Tree>
    </div>
  );
}
