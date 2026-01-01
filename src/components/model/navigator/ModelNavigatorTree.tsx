import { useEffect, useRef } from 'react';
import type * as React from 'react';
import type { Key } from '@react-types/shared';
import {
  Tree,
  TreeItem,
  TreeItemContent
} from 'react-aria-components';

import type { NavNode } from './types';
import { DND_ELEMENT_MIME } from './types';
import { NavigatorNodeRow } from './NavigatorNodeRow';

const DND_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('pwaModellerDndDebug') === '1';
function dndLog(...args: unknown[]) {
  if (!DND_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log('[PWA Modeller DND]', ...args);
}

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
  openCreateElement: (targetFolderId?: string) => void;
  onRequestDeleteFolder: (folderId: string) => void;
  openCreateView: (targetFolderId?: string) => void;
  openCreateCenteredView: (elementId: string) => void;

  /** Optional handler: move an element to a folder when dropped on a folder in the tree. */
  onMoveElementToFolder?: (elementId: string, targetFolderId: string) => void;
};

function parseDraggedElementId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_ELEMENT_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  try {
    const t = dt.getData('text/plain');
    if (t) return t;
  } catch {
    // ignore
  }
  return null;
}

function isMaybeElementDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  try {
    const types = Array.from(dt.types ?? []);
    // Note: some browsers restrict getData() during dragover, but types are still visible.
    return types.includes(DND_ELEMENT_MIME) || types.includes('text/plain');
  } catch {
    return false;
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
  onRequestDeleteFolder,
  openCreateView,
  openCreateCenteredView,
  onMoveElementToFolder
}: Props) {
  const treeWrapRef = useRef<HTMLDivElement | null>(null);
  const currentDropElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = treeWrapRef.current;
    if (!root) return;

    // Native listeners: React Aria Tree can swallow/retarget drag events. Capturing native events
    // on the tree wrapper makes folder drops reliable.
    const clearHighlight = () => {
      if (currentDropElRef.current) {
        currentDropElRef.current.classList.remove('isDropTarget');
        currentDropElRef.current = null;
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (!onMoveElementToFolder) return;
      // During dragover, some browsers may not expose the data payload via getData().
      // Accept the drop based on visible types and resolve the element id on drop.
      if (!isMaybeElementDrag(e.dataTransfer)) {
        clearHighlight();
        return;
      }
      const target = e.target as HTMLElement | null;
      const row = target?.closest('.navTreeRow[data-drop-folder="folder"]') as HTMLElement | null;
      if (!row) {
        clearHighlight();
        return;
      }
      // Accept the drop.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (currentDropElRef.current !== row) {
        clearHighlight();
        row.classList.add('isDropTarget');
        currentDropElRef.current = row;
      }
      dndLog('tree folder dragover (accepted)', { folderId: row.dataset.folderid, types: Array.from(e.dataTransfer?.types ?? []) });
    };

    const onDrop = (e: DragEvent) => {
      if (!onMoveElementToFolder) return;
      const elId = parseDraggedElementId(e.dataTransfer);
      const target = e.target as HTMLElement | null;
      const row = target?.closest('.navTreeRow[data-drop-folder="folder"]') as HTMLElement | null;
      const folderId = row?.dataset.folderid;
      clearHighlight();
      if (!elId || !folderId) return;
      e.preventDefault();
      e.stopPropagation();
      dndLog('tree folder drop', { elementId: elId, folderId });
      // Safety: confirmation to avoid accidental moves.
      if (window.confirm('Move element to this folder?')) {
        onMoveElementToFolder(elId, folderId);
      }
    };

    const onDragLeave = (_e: DragEvent) => {
      // If the pointer leaves the tree wrapper entirely, clear highlight.
      // (dragover will re-apply when entering another folder row)
      // Note: dragleave fires frequently; keep this conservative.
    };

    const onDragEnd = () => {
      clearHighlight();
    };

    root.addEventListener('dragover', onDragOver, true);
    root.addEventListener('drop', onDrop, true);
    root.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('dragend', onDragEnd, true);

    return () => {
      root.removeEventListener('dragover', onDragOver, true);
      root.removeEventListener('drop', onDrop, true);
      root.removeEventListener('dragleave', onDragLeave, true);
      document.removeEventListener('dragend', onDragEnd, true);
      clearHighlight();
    };
  }, [onMoveElementToFolder]);

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
            openCreateFolder={openCreateFolder}
            openCreateElement={openCreateElement}
            openCreateView={openCreateView}
            openCreateCenteredView={openCreateCenteredView}
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
        <NavigatorTreeItem node={n} depth={0} key={n.key} />
      ))}
      </Tree>
    </div>
  );
}
