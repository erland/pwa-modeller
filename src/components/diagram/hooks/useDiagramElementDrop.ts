import type * as React from 'react';
import { useCallback, useState } from 'react';
import type { Model } from '../../../domain';
import { modelStore } from '../../../store';
import { getNotation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { dataTransferHasElement, readDraggedElementIds } from '../dragDrop';

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
      const elementIds = readDraggedElementIds(e.dataTransfer);
      if (!elementIds.length) return;
      const view = model.views[activeViewId];
      if (view) {
        const notation = getNotation(view.kind ?? 'archimate');
        // Filter by existence + notation rules.
        const allowed = elementIds
          .filter((id) => Boolean(model.elements[id]))
          .filter((id) => notation.canCreateNode({ nodeType: model.elements[id]!.type }));

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
    [activeViewId, model, onSelect, viewportRef, zoom]
  );

  return {
    isDragOver,
    handleViewportDragOver,
    handleViewportDragLeave,
    handleViewportDrop,
  };
}
