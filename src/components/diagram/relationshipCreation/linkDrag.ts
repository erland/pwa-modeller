import type { Model } from '../../../domain';
import type { ViewNodeLayout } from '../../../domain';
import type { Point } from '../geometry';
import { hitTestConnectable } from '../geometry';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { ConnectableRef } from '../connectable';

/**
 * Notation-aware filtering of potential drop targets.
 * Currently only BPMN excludes pool/lane containers as relationship endpoints.
 */
export function filterDropTarget(args: {
  model: Model | null;
  viewId: string;
  targetRef: ConnectableRef | null;
}): ConnectableRef | null {
  const { model, viewId, targetRef } = args;
  if (!model || !targetRef) return targetRef;

  const view = model.views[viewId];
  const viewKind = view?.kind ?? 'archimate';

  // BPMN v2 containers (pool/lane) should not be offered as relationship drop targets.
  if (viewKind === 'bpmn' && targetRef.kind === 'element') {
    const t = model.elements[targetRef.id]?.type;
    if (t === 'bpmn.pool' || t === 'bpmn.lane') return null;
  }

  return targetRef;
}

export function hitTestRelationshipTarget(args: {
  model: Model | null;
  nodes: ViewNodeLayout[];
  viewId: string;
  point: Point;
}): ConnectableRef | null {
  const { model, nodes, viewId, point } = args;
  const rawTargetRef = hitTestConnectable(nodes, point, null); // allow self-relationships
  return filterDropTarget({ model, viewId, targetRef: rawTargetRef });
}

export function updateLinkDragOnMove(args: {
  prev: DiagramLinkDrag;
  model: Model | null;
  nodes: ViewNodeLayout[];
  point: Point;
}): DiagramLinkDrag {
  const { prev, model, nodes, point } = args;
  const targetRef = hitTestRelationshipTarget({ model, nodes, viewId: prev.viewId, point });
  return { ...prev, currentPoint: point, targetRef };
}

export function resolveLinkDragTargetOnUp(args: {
  prev: DiagramLinkDrag;
  model: Model | null;
  nodes: ViewNodeLayout[];
  point: Point | null;
}): ConnectableRef | null {
  const { prev, model, nodes, point } = args;
  if (point) return hitTestRelationshipTarget({ model, nodes, viewId: prev.viewId, point });
  // If we can't compute a point (rare), fall back to current targetRef
  return filterDropTarget({ model, viewId: prev.viewId, targetRef: prev.targetRef ?? null });
}
