import { useRef } from 'react';
import type * as React from 'react';
import type { Key } from '@react-types/shared';
import { Tree } from 'react-aria-components';

import type { NavNode } from './types';
import { NavigatorTreeItem } from './NavigatorTreeItem';
import type { ModelKind } from '../../../domain';
import type { Selection } from '../selection';
import { useNavigatorTreeDnd } from './useNavigatorTreeDnd';
import { collectExpandableKeysInSubtree, expandSingleChildChainFromKey, findNodeByKey } from './navUtils';

type Props = {
  /** The technical root folder id. UI hides the root node but we still need a drop/create target for it. */
  rootFolderId: string;
  treeData: NavNode[];
  selectedKeys: Set<Key>;
  getRecentMultiSelectedElementIds: () => string[];
  restoreRecentMultiSelectionForDrag: (draggedElementId: string | null | undefined) => void;
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

  /** Bubble selection changes up to the workspace (used by some create actions). */
  onSelect: (selection: Selection) => void;

  /** Optional handler: move an element to a folder when dropped on a folder in the tree. */
  onMoveElementToFolder?: (elementId: string, targetFolderId: string) => void;
  /** Optional handler: move a view to a folder when dropped on a folder in the tree. */
  onMoveViewToFolder?: (viewId: string, targetFolderId: string) => void;
  /** Optional handler: center a view under an element when dropped on an element in the tree. */
  onMoveViewToElement?: (viewId: string, targetElementId: string) => void;
  /** Optional handler: move an element under another element (semantic containment) when dropped on an element in the tree. */
  onMoveElementToElement?: (elementId: string, targetElementId: string) => void;
  /** Optional handler: move a folder under another folder when dropped on a folder in the tree. */
  onMoveFolderToFolder?: (folderId: string, targetFolderId: string) => void;
};


export function ModelNavigatorTree({
  rootFolderId,
  treeData,
  selectedKeys,
  getRecentMultiSelectedElementIds,
  restoreRecentMultiSelectionForDrag,
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
  onSelect,
  onMoveElementToFolder,
  onMoveViewToFolder,
  onMoveViewToElement,
  onMoveElementToElement,
  onMoveFolderToFolder
}: Props) {
  const treeWrapRef = useRef<HTMLDivElement | null>(null);

  useNavigatorTreeDnd({
    treeWrapRef,
    onMoveElementToFolder,
    onMoveViewToFolder,
    onMoveViewToElement,
    onMoveElementToElement,
    onMoveFolderToFolder
  });

  const toggleExpanded = (nodeKey: string) => {
    setExpandedKeys((prev) => {
      const isExpanding = !prev.has(nodeKey);
      if (!isExpanding) {
        // Collapsing: also prune any expanded descendants so re-expanding doesn't
        // unexpectedly open deep levels.
        const next = new Set(prev);
        next.delete(nodeKey);
        const node = findNodeByKey(treeData, nodeKey);
        if (node) {
          for (const k of collectExpandableKeysInSubtree(node)) next.delete(k);
        }
        return next;
      }

      const next = new Set(prev);
      // Expanding: add this node, then keep expanding along any single-child chain.
      for (const k of expandSingleChildChainFromKey(treeData, nodeKey)) {
        next.add(k);
      }
      // If the node is expandable but the helper returned empty (edge cases), ensure it is included.
      next.add(nodeKey);
      return next;
    });
  };

  return (
    <div ref={treeWrapRef}>
      {/*
        Top-level drop/create target.
        The root folder node is intentionally hidden in the tree to save space, but users still need
        an easy way to move items to the top level and create folders directly under the root.
      */}
      <div
        className="navTreeRow navTopLevelRow"
        data-kind="folder"
        data-drop-folder="folder"
        data-folderid={rootFolderId}
        title="Top level"
      >
        <span className="navTreeChevronSpacer" aria-hidden />
        <span className="navTreeIcon" aria-hidden>
          ⬆️
        </span>
        <span className="navTreeLabel">Top level</span>
        <button
          type="button"
          className="navTopLevelCreate"
          aria-label="Create folder at top level"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openCreateFolder(rootFolderId);
          }}
        >
          + Folder
        </button>
      </div>

      <Tree
        aria-label="Model navigator"
        selectionMode="multiple"
        selectionBehavior="replace"
        // Keep selection controlled by the Workspace selection state.
        selectedKeys={selectedKeys}
        onSelectionChange={handleSelectionChange}
        expandedKeys={expandedKeys}
        onExpandedChange={(keys) =>
          setExpandedKeys((prev) => {
            const incoming = new Set(keys as Iterable<Key>);

            // Detect added keys and apply smart single-child expansion for each.
            for (const k of incoming) {
              if (!prev.has(k)) {
                for (const extra of expandSingleChildChainFromKey(treeData, String(k))) {
                  incoming.add(extra);
                }
              }
            }

            // Detect removed keys and prune any expandable descendants.
            for (const k of prev) {
              if (!incoming.has(k)) {
                const node = findNodeByKey(treeData, String(k));
                if (node) {
                  for (const dk of collectExpandableKeysInSubtree(node)) incoming.delete(dk);
                }
              }
            }

            return incoming;
          })
        }
        className="navAriaTree"
        renderEmptyState={() => <div className="navEmpty">No items</div>}
      >
        {treeData.map((n) => (
          <NavigatorTreeItem
            node={n}
            depth={0}
            key={n.key}
            selectedKeys={selectedKeys}
            getRecentMultiSelectedElementIds={getRecentMultiSelectedElementIds}
            restoreRecentMultiSelectionForDrag={restoreRecentMultiSelectionForDrag}
            expandedKeys={expandedKeys}
            toggleExpanded={toggleExpanded}
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
        ))}
      </Tree>
    </div>
  );
}