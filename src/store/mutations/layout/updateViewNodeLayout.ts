import type { Model, ViewNodeLayout } from '../../../domain';
import { ensureViewLayout } from '../helpers';
import { syncViewConnections } from './syncViewConnections';

export function updateViewNodeLayout(
  model: Model,
  viewId: string,
  elementId: string,
  patch: Partial<Omit<ViewNodeLayout, 'elementId'>>
): void {
  const view = model.views[viewId];
  if (!view) return;

  const viewWithLayout = ensureViewLayout(view);
  const idx = viewWithLayout.layout.nodes.findIndex((n) => n.elementId === elementId);
  if (idx < 0) return;

  const prev = viewWithLayout.layout.nodes[idx];
  const next: ViewNodeLayout = { ...prev, ...patch, elementId: prev.elementId };

  // BPMN boundary attachment behavior:
  // - If a host activity moves, move attached boundary events with it.
  // - If a boundary event moves, update its stored per-view offset relative to its host.
  const isBpmnView = viewWithLayout.kind === 'bpmn';
  const movedX = typeof patch.x === 'number' ? patch.x : prev.x;
  const movedY = typeof patch.y === 'number' ? patch.y : prev.y;

  const nextNodes = viewWithLayout.layout.nodes.slice();
  nextNodes[idx] = next;

  if (isBpmnView) {
    const el = model.elements[elementId];
    const elType = el?.type ? String(el.type) : '';

    const isBoundary = elType === 'bpmn.boundaryEvent';
    const attrs =
      el && typeof el.attrs === 'object' && el.attrs !== null && !Array.isArray(el.attrs)
        ? (el.attrs as Record<string, unknown>)
        : null;
    const attachedToRef = attrs && typeof attrs.attachedToRef === 'string' ? (attrs.attachedToRef as string) : null;

    // If the moved node is a boundary event, update its per-view offset.
    if (isBoundary && attachedToRef) {
      const hostNode = viewWithLayout.layout.nodes.find((n) => n.elementId === attachedToRef);
      if (hostNode) {
        const dx = movedX - hostNode.x;
        const dy = movedY - hostNode.y;
        const currentAttrs =
          prev.attrs && typeof prev.attrs === 'object' && prev.attrs !== null && !Array.isArray(prev.attrs)
            ? (prev.attrs as Record<string, unknown>)
            : {};
        nextNodes[idx] = {
          ...nextNodes[idx],
          attrs: { ...currentAttrs, bpmnAttachment: { hostId: attachedToRef, dx, dy } }
        };
      }
    }

    // If the moved node is a potential host, move attached boundaries.
    if (!isBoundary && (typeof patch.x === 'number' || typeof patch.y === 'number')) {
      const hostPrevX = prev.x;
      const hostPrevY = prev.y;
      const hostNextX = movedX;
      const hostNextY = movedY;

      for (let i = 0; i < nextNodes.length; i++) {
        const n = nextNodes[i];
        if (!n.elementId || n.elementId === elementId) continue;
        const bEl = model.elements[n.elementId];
        if (!bEl || String(bEl.type) !== 'bpmn.boundaryEvent') continue;
        const bAttrs =
          bEl.attrs && typeof bEl.attrs === 'object' && bEl.attrs !== null && !Array.isArray(bEl.attrs)
            ? (bEl.attrs as Record<string, unknown>)
            : null;
        const bAttachedToRef = bAttrs && typeof bAttrs.attachedToRef === 'string' ? (bAttrs.attachedToRef as string) : null;
        if (bAttachedToRef !== elementId) continue;

        const nodeAttrs =
          n.attrs && typeof n.attrs === 'object' && n.attrs !== null && !Array.isArray(n.attrs)
            ? (n.attrs as Record<string, unknown>)
            : {};

        const ba = nodeAttrs.bpmnAttachment;
        let dx: number;
        let dy: number;
        if (ba && typeof ba === 'object' && ba !== null && !Array.isArray(ba)) {
          const rec = ba as Record<string, unknown>;
          dx = typeof rec.dx === 'number' ? rec.dx : n.x - hostPrevX;
          dy = typeof rec.dy === 'number' ? rec.dy : n.y - hostPrevY;
        } else {
          dx = n.x - hostPrevX;
          dy = n.y - hostPrevY;
        }

        nextNodes[i] = {
          ...n,
          x: hostNextX + dx,
          y: hostNextY + dy,
          attrs: { ...nodeAttrs, bpmnAttachment: { hostId: elementId, dx, dy } }
        };
      }
    }
  }

  model.views[viewId] = { ...viewWithLayout, layout: { ...viewWithLayout.layout, nodes: nextNodes } };
  // Layout changes may affect which relationships are considered "connected" in the view.
  syncViewConnections(model, viewId);
}
