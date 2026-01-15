import { useCallback, useEffect, useRef } from 'react';
import { modelStore } from '../../../store';
import type { DiagramNodeDragState } from '../DiagramNode';

export function useDiagramNodeDrag(zoom: number) {
  const dragRef = useRef<DiagramNodeDragState | null>(null);

  const beginNodeDrag = useCallback((state: DiagramNodeDragState) => {
    dragRef.current = state;
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;

      // Prevent iOS Safari from scrolling/dragging the page while we drag a node.
      if (e.pointerType !== 'mouse') e.preventDefault();
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;

      const view = modelStore.getState().model?.views[d.viewId];
      const snap = Boolean(view?.formatting?.snapToGrid);
      const grid = view?.formatting?.gridSize ?? 20;

      const ref =
        d.ref.kind === 'element'
          ? { elementId: d.ref.id }
          : d.ref.kind === 'connector'
            ? { connectorId: d.ref.id }
            : { objectId: d.ref.id };

      if (d.action === 'resize') {
        // MVP: bottom-right resize. Clamp to reasonable minimums.
        let minW = 40;
        let minH = 24;
        if (d.ref.kind === 'connector') {
          minW = 16;
          minH = 16;
        }
        if (d.ref.kind === 'object') {
          const obj = view?.objects?.[d.ref.id];
          if (obj?.type === 'GroupBox') {
            minW = 160;
            minH = 120;
          } else if (obj?.type === 'Note') {
            minW = 140;
            minH = 90;
          } else if (obj?.type === 'Divider') {
            // Auto-orientation divider: allow both horizontal and vertical.
            // Decide desired orientation based on the *proposed* size (before clamping).
            const proposedW = d.origW + dx;
            const proposedH = d.origH + dy;
            const vertical = proposedH > proposedW;
            minW = vertical ? 6 : 80;
            minH = vertical ? 80 : 6;
          } else {
            // Label
            minW = 80;
            minH = 24;
          }
        }

        let w = Math.max(minW, d.origW + dx);
        let h = Math.max(minH, d.origH + dy);
        if (snap && grid > 1) {
          w = Math.round(w / grid) * grid;
          h = Math.round(h / grid) * grid;
        }

        modelStore.updateViewNodeLayoutAny(d.viewId, ref, { width: w, height: h });
        return;
      }

      let x = d.origX + dx;
      let y = d.origY + dy;
      if (snap && grid > 1) {
        x = Math.round(x / grid) * grid;
        y = Math.round(y / grid) * grid;
      }

      modelStore.updateViewNodePositionAny(d.viewId, ref, x, y);
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [zoom]);

  return { dragRef, beginNodeDrag };
}
