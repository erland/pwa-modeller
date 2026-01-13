import { useEffect, useRef } from 'react';
import type * as React from 'react';
import type { Key } from '@react-types/shared';
import {
  Tree,
  TreeItem,
  TreeItemContent
} from 'react-aria-components';

import type { NavNode } from './types';
import { DND_ELEMENT_MIME, DND_FOLDER_MIME, DND_VIEW_MIME } from './types';
import { NavigatorNodeRow } from './NavigatorNodeRow';
import type { ModelKind } from '../../../domain';

const DND_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('pwaModellerDndDebug') === '1';
function dndLog(...args: unknown[]) {
  if (!DND_DEBUG) return;
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
  openCreateElement: (targetFolderId?: string, kind?: ModelKind) => void;
  openCreateView: (targetFolderId?: string, kind?: ModelKind) => void;
  openCreateCenteredView: (elementId: string) => void;

  /** Optional handler: move an element to a folder when dropped on a folder in the tree. */
  onMoveElementToFolder?: (elementId: string, targetFolderId: string) => void;
  /** Optional handler: move a view to a folder when dropped on a folder in the tree. */
  onMoveViewToFolder?: (viewId: string, targetFolderId: string) => void;
  /** Optional handler: center a view under an element when dropped on an element in the tree. */
  onMoveViewToElement?: (viewId: string, targetElementId: string) => void;
  /** Optional handler: move a folder under another folder when dropped on a folder in the tree. */
  onMoveFolderToFolder?: (folderId: string, targetFolderId: string) => void;
};

function parsePlainTextPayload(dt: DataTransfer): { kind: 'element' | 'view' | 'folder'; id: string } | null {
  try {
    const raw = dt.getData('text/plain');
    if (!raw) return null;
    const s = String(raw);

    if (s.startsWith('pwa-modeller:')) {
      const parts = s.split(':');
      if (parts.length >= 3) {
        const kind = parts[1];
        const id = parts.slice(2).join(':');
        if ((kind === 'element' || kind === 'view' || kind === 'folder') && id) {
          return { kind, id };
        }
      }
      return null;
    }

    // Legacy fallback: infer kind based on id prefix.
    if (s.startsWith('element_')) return { kind: 'element', id: s };
    if (s.startsWith('view_')) return { kind: 'view', id: s };
    if (s.startsWith('folder_')) return { kind: 'folder', id: s };
  } catch {
    // ignore
  }
  return null;
}

function parseDraggedElementId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_ELEMENT_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  const p = parsePlainTextPayload(dt);
  return p?.kind === 'element' ? p.id : null;
}

function parseDraggedViewId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_VIEW_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  const p = parsePlainTextPayload(dt);
  return p?.kind === 'view' ? p.id : null;
}

function parseDraggedFolderId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_FOLDER_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  const p = parsePlainTextPayload(dt);
  return p?.kind === 'folder' ? p.id : null;
}



function isMaybeSupportedDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  try {
    const types = Array.from(dt.types ?? []);
    // Note: some browsers restrict getData() during dragover, but types are still visible.
    return (
      types.includes(DND_ELEMENT_MIME)
      || types.includes(DND_VIEW_MIME)
      || types.includes(DND_FOLDER_MIME)
      || types.includes('text/plain')
    );
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
      // Use a non-emoji glyph so CSS `color` can style it in light/dark themes.
      return '■';
    case 'relationship':
      // Non-emoji glyph for consistent theming.
      return '⟶';
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
  openCreateView,
  openCreateCenteredView,
  onMoveElementToFolder,
  onMoveViewToFolder,
  onMoveViewToElement,
    onMoveFolderToFolder
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
      if (!onMoveElementToFolder && !onMoveViewToFolder && !onMoveFolderToFolder) return;
      // During dragover, some browsers may not expose the data payload via getData().
      // Accept the drop based on visible types and resolve the id on drop.
      if (!isMaybeSupportedDrag(e.dataTransfer)) {
        clearHighlight();
        return;
      }
      const target = e.target as HTMLElement | null;
      const folderRow = target?.closest('.navTreeRow[data-drop-folder="folder"]') as HTMLElement | null;
      const elementRow = target?.closest('.navTreeRow[data-kind="element"]') as HTMLElement | null;
      const row = folderRow ?? elementRow;
      if (!row) {
        clearHighlight();
        return;
      }
      // Only accept view drops on element rows. Folder/element drops must target folders.
      try {
        const types = Array.from(e.dataTransfer?.types ?? []);
        const isElementRow = row.dataset.kind === 'element';
        if (isElementRow) {
          // If we can see it's an element/folder drag, reject.
          if (types.includes(DND_ELEMENT_MIME) || types.includes(DND_FOLDER_MIME)) {
            clearHighlight();
            return;
          }
        }
      } catch {
        // ignore
      }
const maybeFolderDragId = parseDraggedFolderId(e.dataTransfer);
const isFolderTarget = row.dataset.dropFolder === 'folder';
if (maybeFolderDragId && isFolderTarget && maybeFolderDragId === row.dataset.folderid) {
  // Don't allow dropping a folder onto itself.
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
  if (!onMoveElementToFolder && !onMoveViewToFolder && !onMoveFolderToFolder) return;

  const elementId = parseDraggedElementId(e.dataTransfer);
  const viewId = parseDraggedViewId(e.dataTransfer);
  const folderDragId = parseDraggedFolderId(e.dataTransfer);

  const target = e.target as HTMLElement | null;
  const folderRow = target?.closest('.navTreeRow[data-drop-folder="folder"]') as HTMLElement | null;
  const elementRow = target?.closest('.navTreeRow[data-kind="element"]') as HTMLElement | null;
  const folderId = folderRow?.dataset.folderid;
  const elementIdTarget = elementRow?.dataset.elementid;

  clearHighlight();

  // Allow dropping a view onto an element to center the view under that element.
  if (viewId && elementIdTarget && onMoveViewToElement) {
    e.preventDefault();
    e.stopPropagation();
    dndLog('tree element drop (view)', { viewId, elementIdTarget, types: Array.from(e.dataTransfer?.types ?? []) });
    try {
      if (window.confirm('Center this view under the element?')) {
        onMoveViewToElement(viewId, elementIdTarget);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(msg);
    }
    return;
  }

  // Other drops must target a folder row.
  if (!folderId) return;

  // Ignore drops of a folder onto itself.
  if (folderDragId && folderId && folderDragId === folderId) return;

  e.preventDefault();
  e.stopPropagation();

  dndLog('tree folder drop', { elementId, viewId, folderDragId, folderId, types: Array.from(e.dataTransfer?.types ?? []) });

  try {
    if (elementId && onMoveElementToFolder) {
      if (window.confirm('Move element to this folder?')) {
        onMoveElementToFolder(elementId, folderId);
      }
      return;
    }

    if (viewId && onMoveViewToFolder) {
      if (window.confirm('Move view to this folder?')) {
        onMoveViewToFolder(viewId, folderId);
      }
      return;
    }

    if (folderDragId && onMoveFolderToFolder) {
      if (window.confirm('Move folder into this folder?')) {
        onMoveFolderToFolder(folderDragId, folderId);
      }
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(msg);
  }
};

	    const onDragLeave = () => {
      // If the pointer leaves the tree wrapper entirely, clear highlight.
      // (dragover will re-apply when entering another folder row)
      // Note: dragleave fires frequently; keep this conservative.
    };

    const onDragEnd = () => {
      clearHighlight();
      try {
        window.dispatchEvent(new CustomEvent('modelNavigator:dragend'));
      } catch {
        // ignore
      }
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
  }, [onMoveElementToFolder, onMoveViewToFolder, onMoveFolderToFolder, onMoveViewToElement]);

  const toggleExpanded = (nodeKey: string) => {
    setExpandedKeys((prev) => toggleExpandedKey(prev, nodeKey));
  };

  function NavigatorTreeItem({ node, depth }: { node: NavNode; depth: number }) {
    const isEditing = editingKey === node.key;
    const icon = iconFor(node);
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
            openCreateCenteredView={openCreateCenteredView}          />
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
