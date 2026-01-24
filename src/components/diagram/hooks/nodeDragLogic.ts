import type { Model, View } from '../../../domain';
import type { DiagramDragRef } from '../DiagramNode';

export type ViewNodeRefAny = { elementId?: string; connectorId?: string; objectId?: string };

type Rect = { x: number; y: number; w: number; h: number; z: number; elementId: string; type: string };

export function toViewNodeRef(ref: DiagramDragRef): ViewNodeRefAny {
  return ref.kind === 'element'
    ? { elementId: ref.id }
    : ref.kind === 'connector'
      ? { connectorId: ref.id }
      : { objectId: ref.id };
}

export function getGridSettings(view: View | undefined | null): { snap: boolean; grid: number } {
  const snap = Boolean(view?.formatting?.snapToGrid);
  const grid = view?.formatting?.gridSize ?? 20;
  return { snap, grid };
}

export function snapCoord(n: number, snap: boolean, grid: number): number {
  if (!snap || grid <= 1) return n;
  return Math.round(n / grid) * grid;
}

export function snapXY(x: number, y: number, snap: boolean, grid: number): { x: number; y: number } {
  return { x: snapCoord(x, snap, grid), y: snapCoord(y, snap, grid) };
}

export function computeResizeMinimum(args: {
  dragRef: DiagramDragRef;
  model: Model | null | undefined;
  view: View | null | undefined;
  origW: number;
  origH: number;
  dx: number;
  dy: number;
}): { minW: number; minH: number } {
  const { dragRef, model, view, origW, origH, dx, dy } = args;

  // MVP: bottom-right resize. Clamp to reasonable minimums.
  let minW = 40;
  let minH = 24;

  if (dragRef.kind === 'connector') {
    minW = 16;
    minH = 16;
    return { minW, minH };
  }

  if (dragRef.kind === 'element' && model && view?.kind === 'bpmn') {
    const t = model.elements[dragRef.id]?.type;
    if (t === 'bpmn.pool') {
      minW = 360;
      minH = 180;
    } else if (t === 'bpmn.lane') {
      minW = 360;
      minH = 100;
    }
    return { minW, minH };
  }

  if (dragRef.kind === 'object') {
    const obj = view?.objects?.[dragRef.id];
    if (obj?.type === 'GroupBox') {
      minW = 160;
      minH = 120;
    } else if (obj?.type === 'Note') {
      minW = 140;
      minH = 90;
    } else if (obj?.type === 'Divider') {
      // Auto-orientation divider: allow both horizontal and vertical.
      // Decide desired orientation based on the *proposed* size (before clamping).
      const proposedW = origW + dx;
      const proposedH = origH + dy;
      const vertical = proposedH > proposedW;
      minW = vertical ? 6 : 80;
      minH = vertical ? 80 : 6;
    } else {
      // Label
      minW = 80;
      minH = 24;
    }
  }

  return { minW, minH };
}

function containsPoint(r: Rect, cx: number, cy: number): boolean {
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

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

/**
 * v2 BPMN enhancement: treat Pools/Lanes as containers by clamping moved nodes inside them.
 *
 * Keeps behavior aligned with the previous implementation:
 * - Pools can move freely
 * - Lanes should stay inside a Pool if present
 * - Other BPMN elements prefer Lane, otherwise Pool
 */
export function clampMoveInsideBpmnContainers(args: {
  model: Model;
  view: View;
  movingElementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}): { x: number; y: number } {
  const { model, view, movingElementId, w, h } = args;
  let { x, y } = args;

  if (view.kind !== 'bpmn' || !view.layout?.nodes) return { x, y };
  const movingType = model.elements[movingElementId]?.type;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const containers: Rect[] = [];
  for (const n of view.layout.nodes) {
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
        width: (n as { width?: number }).width ?? 120,
        height: (n as { height?: number }).height ?? 60,
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
    container = pickBest(pools);
  } else {
    container = pickBest(lanes) || pickBest(pools);
  }

  if (!container) return { x, y };

  const pad = 8;
  const extraLeft = container.type === 'bpmn.pool' ? 44 : 0;
  const loX = container.x + pad + extraLeft;
  const hiX = container.x + container.w - w - pad;
  const loY = container.y + pad;
  const hiY = container.y + container.h - h - pad;
  if (hiX >= loX) x = clamp(x, loX, hiX);
  if (hiY >= loY) y = clamp(y, loY, hiY);

  return { x, y };
}
