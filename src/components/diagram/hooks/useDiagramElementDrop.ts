import type * as React from 'react';
import { useCallback, useState } from 'react';
import type { Model } from '../../../domain';
import { createElement } from '../../../domain';
import { modelStore } from '../../../store';
import { getNotation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { dataTransferHasElement, dataTransferHasFolder, readDraggedElementIds, readDraggedFolderId } from '../dragDrop';

type Args = {
  model: Model | null;
  activeViewId: string | null;
  zoom: number;
  viewportRef: React.RefObject<HTMLDivElement>;
  onSelect: (sel: Selection) => void;
};

export function useDiagramElementDrop({ model, activeViewId, zoom, viewportRef, onSelect }: Args) {
  const [isDragOver, setIsDragOver] = useState(false);

  const isUmlActiveView = useCallback((): boolean => {
    if (!model || !activeViewId) return false;
    const v = model.views[activeViewId];
    return (v?.kind ?? 'archimate') === 'uml';
  }, [activeViewId, model]);

  const handleViewportDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!activeViewId) return;

      const allowElements = dataTransferHasElement(e.dataTransfer);
      const allowFolderAsPackage = isUmlActiveView() && dataTransferHasFolder(e.dataTransfer);
      if (!allowElements && !allowFolderAsPackage) return;

      e.preventDefault();
      // IMPORTANT: folders are currently dragged with effectAllowed=move from the navigator.
      // Some browsers (notably Safari) will show "not allowed" unless dropEffect is compatible.
      // For folder->package materialization we are semantically copying, but we use 'move' here
      // to remain compatible with the source effectAllowed and still enable dropping.
      e.dataTransfer.dropEffect = allowFolderAsPackage && !allowElements ? 'move' : 'copy';
      setIsDragOver(true);
    },
    [activeViewId, isUmlActiveView]
  );

  const handleViewportDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleViewportDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setIsDragOver(false);
      if (!model || !activeViewId) return;

      // Ensure the browser accepts the drop (some require preventDefault on drop as well).
      // Payload is still validated below.
      e.preventDefault();

      // Special case: for UML views, allow dragging a folder to materialize (or reuse) a uml.package element.
      const folderId = isUmlActiveView() ? readDraggedFolderId(e.dataTransfer) : null;

      let elementIds: string[] = [];
      let folderDropCreatedPackage: { id: string; type: string } | null = null;
      if (folderId) {
        const folder = model.folders[folderId];
        if (!folder) return;

        const folderExtIds = (folder.externalIds ?? []).map((r) => r.id).filter(Boolean);

        // Find an existing package element mapped to the folder by external id.
        const existingPkgId = Object.values(model.elements).find((el) => {
          if (el.type !== 'uml.package') return false;
          const elExt = (el.externalIds ?? []).map((r) => r.id);
          return folderExtIds.some((x) => elExt.includes(x));
        })?.id;

        const pkgId = existingPkgId ?? (() => {
          const el = createElement({
            name: folder.name,
            type: 'uml.package',
            kind: 'uml',
            externalIds: folder.externalIds ? folder.externalIds.map((r) => ({ ...r })) : undefined,
          });
          modelStore.addElement(el, folderId);
          folderDropCreatedPackage = { id: el.id, type: el.type };
          return el.id;
        })();

        elementIds = [pkgId];
      } else {
        elementIds = readDraggedElementIds(e.dataTransfer);
        if (!elementIds.length) return;
      }

      const view = model.views[activeViewId];
      if (view) {
        const notation = getNotation(view.kind ?? 'archimate');
        // Filter by existence + notation rules.
        const allowed = elementIds
          .filter((id) => Boolean(model.elements[id]) || id === folderDropCreatedPackage?.id)
          .filter((id) => {
            const t = model.elements[id]?.type ?? (id === folderDropCreatedPackage?.id ? folderDropCreatedPackage.type : undefined);
            return t ? notation.canCreateNode({ nodeType: t }) : false;
          });

        if (!allowed.length) return;

        e.preventDefault();

        const vp = viewportRef.current;
        if (!vp) {
          // Fallback: add at default positions.
          for (const id of allowed) modelStore.addElementToView(activeViewId, id);
          onSelect({ kind: 'viewNode', viewId: activeViewId, elementId: allowed[0]! });
          return;
        }

        const rect = vp.getBoundingClientRect();
        const x0 = (vp.scrollLeft + (e.clientX - rect.left)) / zoom;
        const y0 = (vp.scrollTop + (e.clientY - rect.top)) / zoom;

        // Drop multiple elements in a simple grid around the cursor.
        const step = 24;
        const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(allowed.length))));
        for (let i = 0; i < allowed.length; i++) {
          const id = allowed[i]!;
          const dx = (i % cols) * step;
          const dy = Math.floor(i / cols) * step;
          modelStore.addElementToViewAt(activeViewId, id, x0 + dx, y0 + dy);
        }

        onSelect({ kind: 'viewNode', viewId: activeViewId, elementId: allowed[0]! });
        return;
      }

      // If no view (shouldn't happen), do nothing.
    },
    [activeViewId, isUmlActiveView, model, onSelect, viewportRef, zoom]
  );

  return {
    isDragOver,
    handleViewportDragOver,
    handleViewportDragLeave,
    handleViewportDrop,
  };
}
