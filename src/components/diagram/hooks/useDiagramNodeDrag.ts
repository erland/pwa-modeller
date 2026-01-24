import { useCallback, useEffect, useRef } from 'react';
import { modelStore } from '../../../store';
import type { DiagramNodeDragState } from '../DiagramNode';

import {
  clampMoveInsideBpmnContainers,
  computeResizeMinimum,
  getGridSettings,
  snapCoord,
  snapXY,
  toViewNodeRef,
} from './nodeDragLogic';

/**
 * Node dragging (move/resize).
 *
 * v2 BPMN enhancement: treat Pools/Lanes as containers by clamping moved nodes inside them.
 */
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

      const state = modelStore.getState();
      const model = state.model;
      const view = model?.views[d.viewId];

      const { snap, grid } = getGridSettings(view);
      const ref = toViewNodeRef(d.ref);

      // Respect locked nodes for move operations.
      if (d.action === 'move' && d.locked) {
        return;
      }

      if (d.action === 'resize') {
        const { minW, minH } = computeResizeMinimum({
          dragRef: d.ref,
          model,
          view,
          origW: d.origW,
          origH: d.origH,
          dx,
          dy,
        });

        let w = Math.max(minW, d.origW + dx);
        let h = Math.max(minH, d.origH + dy);
        w = snapCoord(w, snap, grid);
        h = snapCoord(h, snap, grid);

        modelStore.updateViewNodeLayoutAny(d.viewId, ref, { width: w, height: h });
        return;
      }

      // Multi-select batch move: if the drag state has a batch, move all batch members by the same delta.
      // We apply snap-to-grid per node and perform a single store update for the whole batch.
      if (d.batch && d.batch.length > 1) {
        const updates = d.batch
          .filter((b) => !b.locked)
          .map((b) => {
            const p = snapXY(b.origX + dx, b.origY + dy, snap, grid);
            return { ref: toViewNodeRef(b.ref), x: p.x, y: p.y };
          });

        if (updates.length > 0) modelStore.updateViewNodePositionsAny(d.viewId, updates);
        return;
      }

      let p = snapXY(d.origX + dx, d.origY + dy, snap, grid);

      // v2 BPMN: keep moved nodes inside Pools/Lanes when present.
      if (d.ref.kind === 'element' && model && view) {
        p = clampMoveInsideBpmnContainers({
          model,
          view,
          movingElementId: d.ref.id,
          x: p.x,
          y: p.y,
          w: d.origW,
          h: d.origH,
        });
      }

      modelStore.updateViewNodePositionAny(d.viewId, ref, p.x, p.y);
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
