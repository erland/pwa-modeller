import { useCallback, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';

import type { Model } from '../../../domain';
import type { Point } from '../../diagram/geometry';
import { dataTransferHasElement, readDraggedElementId } from '../../diagram/dragDrop';

import type { SandboxNode } from '../workspace/controller/sandboxTypes';

export type SandboxDragController = {
  isDropTarget: boolean;
  onPointerDownNode: (e: PointerEvent<SVGGElement>, elementId: string) => void;
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUpOrCancel: (e: PointerEvent<SVGSVGElement>) => void;
  onDragOver: (e: DragEvent<SVGSVGElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<SVGSVGElement>) => void;
};

type DragState = {
  elementId: string;
  offsetX: number;
  offsetY: number;
};

export function useSandboxDragController({
  nodeById,
  model,
  clientToWorld,
  onMoveNode,
  onPointerMoveCanvas,
  onPointerUpOrCancelCanvas,
  nodeW,
  nodeH,
  onAddNodeAt,
  onSelectElement,
}: {
  nodeById: Map<string, SandboxNode>;
  model: Model;
  clientToWorld: (clientX: number, clientY: number) => Point;
  onMoveNode: (elementId: string, x: number, y: number) => void;
  onPointerMoveCanvas: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUpOrCancelCanvas: (e: PointerEvent<SVGSVGElement>) => void;
  nodeW: number;
  nodeH: number;
  onAddNodeAt: (elementId: string, x: number, y: number) => void;
  onSelectElement: (elementId: string) => void;
}): SandboxDragController {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const onPointerDownNode = useCallback(
    (e: PointerEvent<SVGGElement>, elementId: string) => {
      const node = nodeById.get(elementId);
      if (!node) return;
      const p = clientToWorld(e.clientX, e.clientY);
      setDrag({ elementId, offsetX: p.x - node.x, offsetY: p.y - node.y });
      (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [clientToWorld, nodeById]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      // Node drag has priority.
      if (drag) {
        const p = clientToWorld(e.clientX, e.clientY);
        const nx = p.x - drag.offsetX;
        const ny = p.y - drag.offsetY;
        onMoveNode(drag.elementId, nx, ny);
        e.preventDefault();
        return;
      }

      onPointerMoveCanvas(e);
    },
    [clientToWorld, drag, onMoveNode, onPointerMoveCanvas]
  );

  const onPointerUpOrCancel = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (drag) {
        setDrag(null);
        try {
          (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      onPointerUpOrCancelCanvas(e);
    },
    [drag, onPointerUpOrCancelCanvas]
  );

  const onDragOver = useCallback((e: DragEvent<SVGSVGElement>) => {
    if (!dataTransferHasElement(e.dataTransfer)) return;
    e.preventDefault();
    setIsDropTarget(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<SVGSVGElement>) => {
      setIsDropTarget(false);
      if (!dataTransferHasElement(e.dataTransfer)) return;
      e.preventDefault();

      const id = readDraggedElementId(e.dataTransfer);
      if (!id) return;
      if (!model.elements[id]) return;

      const p = clientToWorld(e.clientX, e.clientY);
      const x = p.x - nodeW / 2;
      const y = p.y - nodeH / 2;
      onAddNodeAt(id, x, y);
      onSelectElement(id);
    },
    [clientToWorld, model.elements, nodeH, nodeW, onAddNodeAt, onSelectElement]
  );

  return {
    isDropTarget,
    onPointerDownNode,
    onPointerMove,
    onPointerUpOrCancel,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
