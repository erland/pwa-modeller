import type { Model, ViewNodeLayout } from '../../../domain';
import { getView } from '../helpers';

export function updateViewNodePositionAny(
  model: Model,
  viewId: string,
  ref: { elementId?: string; connectorId?: string; objectId?: string },
  x: number,
  y: number
): void {
  const view = getView(model, viewId);
  if (!view.layout) return;

  const layout = view.layout;
  const moved = layout.nodes.find((n) => {
    if (ref.elementId && n.elementId === ref.elementId) return true;
    if (ref.connectorId && n.connectorId === ref.connectorId) return true;
    if (ref.objectId && n.objectId === ref.objectId) return true;
    return false;
  });

  // If the node does not exist, we can't apply the move.
  if (!moved) return;

  // TypeScript doesn't reliably preserve narrowing for captured variables inside
  // nested helper functions. Use a non-optional local for those helpers.
  const movedNode: ViewNodeLayout = moved;

  const dx = x - movedNode.x;
  const dy = y - movedNode.y;

  // Identify nodes fully contained within the moved node (prior to the move),
  // and move them by the same delta. This makes "container" nodes behave as
  // expected (e.g. Pools/Lanes), and is generally useful for group-like shapes.
  const pad = 2; // small tolerance so touching borders still counts as "inside"
  const container = { x: movedNode.x, y: movedNode.y, w: movedNode.width, h: movedNode.height };

  function isSameNode(n: ViewNodeLayout): boolean {
    if (movedNode.elementId && n.elementId === movedNode.elementId) return true;
    if (movedNode.connectorId && n.connectorId === movedNode.connectorId) return true;
    if (movedNode.objectId && n.objectId === movedNode.objectId) return true;
    return false;
  }

  function isFullyInside(n: ViewNodeLayout): boolean {
    // Guard against missing sizes (shouldn't happen, but keep it safe).
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    return (
      n.x >= container.x + pad &&
      n.y >= container.y + pad &&
      n.x + w <= container.x + container.w - pad &&
      n.y + h <= container.y + container.h - pad
    );
  }

  const moveAlso = dx !== 0 || dy !== 0 ? new Set<string>() : null;

  if (moveAlso) {
    for (const n of layout.nodes) {
      if (isSameNode(n)) continue;
      if (!isFullyInside(n)) continue;

      // Use a stable key for Set membership across element/connector/object nodes.
      if (n.elementId) moveAlso.add(`e:${n.elementId}`);
      else if (n.connectorId) moveAlso.add(`c:${n.connectorId}`);
      else if (n.objectId) moveAlso.add(`o:${n.objectId}`);
    }
  }

  const nextNodes = layout.nodes.map((n) => {
    const matchesElement = ref.elementId && n.elementId === ref.elementId;
    const matchesConnector = ref.connectorId && n.connectorId === ref.connectorId;
    const matchesObject = ref.objectId && n.objectId === ref.objectId;
    const isPrimary = Boolean(matchesElement || matchesConnector || matchesObject);

    const key = n.elementId ? `e:${n.elementId}` : n.connectorId ? `c:${n.connectorId}` : n.objectId ? `o:${n.objectId}` : '';
    const shouldMoveWith = Boolean(moveAlso && key && moveAlso.has(key));

    if (!isPrimary && !shouldMoveWith) return n;
    if (isPrimary) return { ...n, x, y };
    return { ...n, x: n.x + dx, y: n.y + dy };
  });

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  type BpmnAttachment = { hostId: string; dx: number; dy: number };
  const isBpmnAttachment = (v: unknown): v is BpmnAttachment => {
    if (!isRecord(v)) return false;
    const hostId = v.hostId;
    const dx = v.dx;
    const dy = v.dy;
    return typeof hostId === "string" && typeof dx === "number" && typeof dy === "number";
  };


  let finalNodes = nextNodes;

  if (view.kind === "bpmn" && ref.elementId) {
    const movedEl = model.elements[ref.elementId];
    const movedType = movedEl?.type ? String(movedEl.type) : "";
    const isBoundary = movedType === "bpmn.boundaryEvent";

    const originalByElementId = new Map<string, ViewNodeLayout>();
    for (const n of layout.nodes) {
      if (n.elementId) originalByElementId.set(n.elementId, n);
    }

    const getAttachedToRef = (elementId: string): string | null => {
      const el = model.elements[elementId];
      if (!el) return null;
      const a = el.attrs;
      if (!isRecord(a)) return null;
      const r = a.attachedToRef;
      return typeof r === "string" ? r : null;
    };

    if (isBoundary) {
      const hostId = getAttachedToRef(ref.elementId);
      if (hostId) {
        const hostNode = finalNodes.find((n) => n.elementId === hostId);
        const boundaryNode = finalNodes.find((n) => n.elementId === ref.elementId);
        if (hostNode && boundaryNode) {
          const dx2 = boundaryNode.x - hostNode.x;
          const dy2 = boundaryNode.y - hostNode.y;
          const currentAttrs = isRecord(boundaryNode.attrs) ? boundaryNode.attrs : {};
          finalNodes = finalNodes.map((n) =>
            n.elementId === ref.elementId
              ? { ...n, attrs: { ...currentAttrs, bpmnAttachment: { hostId, dx: dx2, dy: dy2 } } }
              : n
          );
        }
      }
    } else if (dx !== 0 || dy !== 0) {
      const hostPrevX = movedNode.x;
      const hostPrevY = movedNode.y;
      const hostNextX = x;
      const hostNextY = y;

      finalNodes = finalNodes.map((n) => {
        if (!n.elementId) return n;
        const bEl = model.elements[n.elementId];
        if (!bEl || String(bEl.type) !== "bpmn.boundaryEvent") return n;
        const attachedToRef = getAttachedToRef(n.elementId);
        if (attachedToRef !== ref.elementId) return n;

        const original = originalByElementId.get(n.elementId) ?? n;
        const nodeAttrs = isRecord(n.attrs) ? n.attrs : {};
        const ba = (nodeAttrs as Record<string, unknown>).bpmnAttachment;
        let dx0: number;
        let dy0: number;
        if (isBpmnAttachment(ba)) {
          dx0 = ba.dx;
          dy0 = ba.dy;
        } else {
          dx0 = original.x - hostPrevX;
          dy0 = original.y - hostPrevY;
        }

        return {
          ...n,
          x: hostNextX + dx0,
          y: hostNextY + dy0,
          attrs: { ...nodeAttrs, bpmnAttachment: { hostId: ref.elementId, dx: dx0, dy: dy0 } }
        };
      });
    }
  }

  model.views[viewId] = { ...view, layout: { nodes: finalNodes, relationships: layout.relationships } };
}

/** Updates layout properties on an element-node, connector-node, or view-object node in a view. */
