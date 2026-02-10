import { useEffect, useRef } from 'react';
import type * as React from 'react';

import {
  dndLog,
  isMaybeSupportedDrag,
  parseDraggedElementId,
  parseDraggedFolderId,
  parseDraggedViewId
} from './dndUtils';
import { DND_ELEMENT_MIME, DND_FOLDER_MIME } from './types';

type Options = {
  /** The wrapper element around the react-aria Tree. */
  treeWrapRef: React.RefObject<HTMLDivElement | null>;

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

/**
 * Native DnD handlers for the navigator tree wrapper.
 *
 * React Aria's Tree can swallow/retarget drag events. Capturing native events
 * on the tree wrapper makes folder drops reliable.
 */
export function useNavigatorTreeDnd({
  treeWrapRef,
  onMoveElementToFolder,
  onMoveViewToFolder,
  onMoveViewToElement,
  onMoveElementToElement,
  onMoveFolderToFolder
}: Options) {
  const currentDropElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = treeWrapRef.current;
    if (!root) return;

    const clearHighlight = () => {
      if (currentDropElRef.current) {
        currentDropElRef.current.classList.remove('isDropTarget');
        currentDropElRef.current = null;
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (!onMoveElementToFolder && !onMoveViewToFolder && !onMoveFolderToFolder && !onMoveViewToElement && !onMoveElementToElement) return;
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
          // Element rows can accept view drops (center view) and optionally element drops (reparent).
          if (types.includes(DND_FOLDER_MIME)) {
            clearHighlight();
            return;
          }

          if (types.includes(DND_ELEMENT_MIME) && !onMoveElementToElement) {
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
      dndLog('tree dragover (accepted)', { folderId: row.dataset.folderid, types: Array.from(e.dataTransfer?.types ?? []) });
    };

    const onDrop = (e: DragEvent) => {
      if (!onMoveElementToFolder && !onMoveViewToFolder && !onMoveFolderToFolder && !onMoveViewToElement && !onMoveElementToElement) return;

      const elementId = parseDraggedElementId(e.dataTransfer);
      const viewId = parseDraggedViewId(e.dataTransfer);
      const folderDragId = parseDraggedFolderId(e.dataTransfer);

      const target = e.target as HTMLElement | null;
      const folderRow = target?.closest('.navTreeRow[data-drop-folder="folder"]') as HTMLElement | null;
      const elementRow = target?.closest('.navTreeRow[data-kind="element"]') as HTMLElement | null;
      const folderId = folderRow?.dataset.folderid;
      const elementIdTarget = elementRow?.dataset.elementid;

      clearHighlight();

      // Allow dropping an element onto an element to reparent (semantic containment).
      if (elementId && elementIdTarget && onMoveElementToElement) {
        if (elementId === elementIdTarget) return;
        e.preventDefault();
        e.stopPropagation();
        dndLog('tree element drop (element)', { elementId, elementIdTarget, types: Array.from(e.dataTransfer?.types ?? []) });
        try {
          if (window.confirm('Nest this element under the target element?')) {
            onMoveElementToElement(elementId, elementIdTarget);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          window.alert(msg);
        }
        return;
      }

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

    const onDragEnd = () => {
      clearHighlight();
      try {
        window.dispatchEvent(new CustomEvent('modelNavigator:dragend'));
      } catch {
        // ignore
      }
    };

    // Note: dragleave fires frequently; keep this conservative.
    const onDragLeave = () => {
      // If the pointer leaves the tree wrapper entirely, clear highlight.
      // (dragover will re-apply when entering another folder row)
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
  }, [treeWrapRef, onMoveElementToFolder, onMoveViewToFolder, onMoveFolderToFolder, onMoveViewToElement, onMoveElementToElement]);
}
