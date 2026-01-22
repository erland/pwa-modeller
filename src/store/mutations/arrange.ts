import type { DistributeMode, Model, SameSizeMode, ViewNodeLayout } from '../../domain';
import { getView } from './helpers';
import { syncViewConnections } from './layout/syncViewConnections';

function getNodeSize(n: ViewNodeLayout): { w: number; h: number } {
  return { w: n.width ?? 120, h: n.height ?? 60 };
}

type NodeInfo = {
  elementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
};

function collectSelectedElementNodes(model: Model, viewId: string, elementIds: string[]): NodeInfo[] {
  const view = getView(model, viewId);
  const layout = view.layout;
  if (!layout) return [];

  const idSet = new Set(elementIds);
  const selected: NodeInfo[] = [];
  for (const n of layout.nodes) {
    if (!n.elementId) continue;
    if (!idSet.has(n.elementId)) continue;
    const { w, h } = getNodeSize(n);
    selected.push({
      elementId: n.elementId,
      x: n.x,
      y: n.y,
      w,
      h,
      locked: Boolean((n as { locked?: boolean }).locked),
    });
  }
  return selected;
}

/**
 * Make selected element nodes the same size.
 *
 * Uses the last element id in the provided list as the reference (i.e. most recently selected).
 */
export function sameSizeViewElements(model: Model, viewId: string, elementIds: string[], mode: SameSizeMode): void {
  if (elementIds.length < 2) return;
  const view = getView(model, viewId);
  const layout = view.layout;
  if (!layout) return;

  const selected = collectSelectedElementNodes(model, viewId, elementIds);
  if (selected.length < 2) return;

  const refId = elementIds.slice().reverse().find((id) => selected.some((n) => n.elementId === id)) ?? selected[selected.length - 1].elementId;
  const ref = selected.find((n) => n.elementId === refId);
  if (!ref) return;

  const updates = new Map<string, { w: number; h: number }>();
  for (const n of selected) {
    const nextW = mode === 'height' ? n.w : ref.w;
    const nextH = mode === 'width' ? n.h : ref.h;
    if (nextW === n.w && nextH === n.h) continue;
    updates.set(n.elementId, { w: nextW, h: nextH });
  }

  if (updates.size === 0) return;

  let changed = false;
  const nextNodes = layout.nodes.map((n) => {
    if (!n.elementId) return n;
    const u = updates.get(n.elementId);
    if (!u) return n;
    const prevW = n.width ?? 120;
    const prevH = n.height ?? 60;
    if (prevW === u.w && prevH === u.h) return n;
    changed = true;
    return { ...n, width: u.w, height: u.h };
  });

  if (!changed) return;
  model.views[viewId] = { ...view, layout: { ...layout, nodes: nextNodes } };
  syncViewConnections(model, viewId);
}

/**
 * Distribute selected element nodes evenly.
 *
 * - Works on element-backed view nodes.
 * - Keeps locked nodes fixed. Locked nodes act as anchors that split the distribution into segments.
 * - Also treats the first/last node (in axis order) as anchors so distribution is stable.
 */
export function distributeViewElements(model: Model, viewId: string, elementIds: string[], mode: DistributeMode): void {
  if (elementIds.length < 3) return;

  const view = getView(model, viewId);
  const layout = view.layout;
  if (!layout) return;

  const selected = collectSelectedElementNodes(model, viewId, elementIds);
  if (selected.length < 3) return;

  const axis = mode;
  const ordered = [...selected].sort((a, b) => {
    if (axis === 'horizontal') {
      const dx = a.x - b.x;
      return dx !== 0 ? dx : a.elementId.localeCompare(b.elementId);
    }
    const dy = a.y - b.y;
    return dy !== 0 ? dy : a.elementId.localeCompare(b.elementId);
  });

  // Anchor indices: first, last, and any locked nodes.
  const anchorIdx = new Set<number>();
  anchorIdx.add(0);
  anchorIdx.add(ordered.length - 1);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].locked) anchorIdx.add(i);
  }
  const anchors = [...anchorIdx].sort((a, b) => a - b);

  // Helper to update a batch of element ids.
  const nextPos = new Map<string, { x: number; y: number }>();

  for (let a = 0; a < anchors.length - 1; a++) {
    const i = anchors[a];
    const j = anchors[a + 1];
    if (j <= i + 1) continue;

    const left = ordered[i];
    const right = ordered[j];

    const between = ordered.slice(i + 1, j).filter((n) => !n.locked);
    if (between.length === 0) continue;

    if (axis === 'horizontal') {
      const rangeStart = left.x + left.w;
      const rangeEnd = right.x;
      const sumW = between.reduce((acc, n) => acc + n.w, 0);
      const available = Math.max(0, rangeEnd - rangeStart - sumW);
      const gap = available / (between.length + 1);

      let cursor = rangeStart + gap;
      for (const n of between) {
        nextPos.set(n.elementId, { x: Math.round(cursor), y: n.y });
        cursor += n.w + gap;
      }
    } else {
      const rangeStart = left.y + left.h;
      const rangeEnd = right.y;
      const sumH = between.reduce((acc, n) => acc + n.h, 0);
      const available = Math.max(0, rangeEnd - rangeStart - sumH);
      const gap = available / (between.length + 1);

      let cursor = rangeStart + gap;
      for (const n of between) {
        nextPos.set(n.elementId, { x: n.x, y: Math.round(cursor) });
        cursor += n.h + gap;
      }
    }
  }

  if (nextPos.size === 0) return;

  let changed = false;
  const nextNodes = layout.nodes.map((n) => {
    if (!n.elementId) return n;
    const p = nextPos.get(n.elementId);
    if (!p) return n;
    if ((n as { locked?: boolean }).locked) return n;
    if (n.x === p.x && n.y === p.y) return n;
    changed = true;
    return { ...n, x: p.x, y: p.y };
  });

  if (!changed) return;
  model.views[viewId] = { ...view, layout: { ...layout, nodes: nextNodes } };
  syncViewConnections(model, viewId);
}
