import type * as React from 'react';
import { useCallback, useState } from 'react';
import type { Model } from '../../../domain';
import { modelStore } from '../../../store';
import type { Selection } from '../../model/selection';
import { dataTransferHasElement, readDraggedElementId } from '../dragDrop';

type Args = {
  model: Model | null;
  activeViewId: string | null;
  zoom: number;
  viewportRef: React.RefObject<HTMLDivElement>;
  onSelect: (sel: Selection) => void;
};

export function useDiagramElementDrop({ model, activeViewId, zoom, viewportRef, onSelect }: Args) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleViewportDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!activeViewId) return;
      if (!dataTransferHasElement(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    },
    [activeViewId]
  );

  const handleViewportDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleViewportDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setIsDragOver(false);
      if (!model || !activeViewId) return;
      const elementId = readDraggedElementId(e.dataTransfer);
      if (!elementId) return;
      if (!model.elements[elementId]) return;

      e.preventDefault();

      const vp = viewportRef.current;
      if (!vp) {
        modelStore.addElementToView(activeViewId, elementId);
        onSelect({ kind: 'viewNode', viewId: activeViewId, elementId });
        return;
      }

      const rect = vp.getBoundingClientRect();
      const x = (vp.scrollLeft + (e.clientX - rect.left)) / zoom;
      const y = (vp.scrollTop + (e.clientY - rect.top)) / zoom;

      modelStore.addElementToViewAt(activeViewId, elementId, x, y);
      onSelect({ kind: 'viewNode', viewId: activeViewId, elementId });
    },
    [activeViewId, model, onSelect, viewportRef, zoom]
  );

  return {
    isDragOver,
    handleViewportDragOver,
    handleViewportDragLeave,
    handleViewportDrop,
  };
}
