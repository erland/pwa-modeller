import { useCallback, useEffect, useRef } from 'react';
import { modelStore } from '../../../store';
import type { DiagramNodeDragState } from '../DiagramNode';

type Rect = { x: number; y: number; w: number; h: number; z: number; elementId: string; type: string };

function rectForNode(args: {
  elementId: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}): Rect {
  return {
    x: args.x,
    y: args.y,
    w: args.width,
    h: args.height,
    z: typeof args.zIndex === 'number' ? args.zIndex : 0,
    elementId: args.elementId,
    type: args.type,
  };
}

function containsPoint(r: Rect, cx: number, cy: number): boolean {
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

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

        if (d.ref.kind === 'element' && model && view?.kind === 'bpmn') {
          const t = model.elements[d.ref.id]?.type;
          if (t === 'bpmn.pool') {
            minW = 360;
            minH = 180;
          } else if (t === 'bpmn.lane') {
            minW = 360;
            minH = 100;
          }
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

      // v2 BPMN: keep moved nodes inside Pools/Lanes when present.
      if (d.ref.kind === 'element' && model && view?.kind === 'bpmn' && view.layout?.nodes) {
        const movingType = model.elements[d.ref.id]?.type;
        const nodes = view.layout.nodes;

        const movingW = d.origW;
        const movingH = d.origH;
        const cx = x + movingW / 2;
        const cy = y + movingH / 2;

        const containers: Rect[] = [];
        for (const n of nodes) {
          if (!n.elementId) continue;
          const el = model.elements[n.elementId];
          if (!el) continue;
          if (el.type !== 'bpmn.pool' && el.type !== 'bpmn.lane') continue;
          containers.push(
            rectForNode({
              elementId: n.elementId,
              type: String(el.type),
              x: n.x,
              y: n.y,
              width: n.width ?? 120,
              height: n.height ?? 60,
              zIndex: n.zIndex,
            })
          );
        }

        const pools = containers.filter((r) => r.type === 'bpmn.pool');
        const lanes = containers.filter((r) => r.type === 'bpmn.lane');

        const pickBest = (rs: Rect[]): Rect | null => {
          let best: Rect | null = null;
          let bestArea = Number.POSITIVE_INFINITY;
          let bestZ = -Infinity;
          for (const r of rs) {
            if (!containsPoint(r, cx, cy)) continue;
            const area = r.w * r.h;
            const z = r.z;
            if (area < bestArea || (area === bestArea && z > bestZ)) {
              best = r;
              bestArea = area;
              bestZ = z;
            }
          }
          return best;
        };

        let container: Rect | null = null;
        if (movingType === 'bpmn.pool') {
          container = null;
        } else if (movingType === 'bpmn.lane') {
          // Lanes should live inside a Pool if one is present.
          container = pickBest(pools);
        } else {
          // Prefer lane, otherwise pool.
          container = pickBest(lanes) || pickBest(pools);
        }

        if (container) {
          const pad = 8;
          const extraLeft = container.type === 'bpmn.pool' ? 44 : 0;
          const loX = container.x + pad + extraLeft;
          const hiX = container.x + container.w - movingW - pad;
          const loY = container.y + pad;
          const hiY = container.y + container.h - movingH - pad;
          if (hiX >= loX) x = clamp(x, loX, hiX);
          if (hiY >= loY) y = clamp(y, loY, hiY);
        }
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
