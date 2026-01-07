import type * as React from 'react';
import type { RelationshipConnector, ViewNodeLayout } from '../../domain';
import type { Selection } from '../model/selection';
import type { Point } from './geometry';
import type { ConnectableRef } from './connectable';
import { sameRef } from './connectable';
import type { DiagramLinkDrag, DiagramNodeDragState } from './DiagramNode';

type Props = {
  node: ViewNodeLayout;
  connector: RelationshipConnector;
  activeViewId: string;
  isSelected: boolean;
  linkDrag: DiagramLinkDrag | null;
  onSelect: (selection: Selection) => void;

  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
  onHoverAsRelationshipTarget: (ref: ConnectableRef | null) => void;

  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onStartLinkDrag: (drag: DiagramLinkDrag) => void;
};

export function DiagramConnectorNode({
  node: n,
  connector: c,
  activeViewId,
  isSelected,
  linkDrag,
  onSelect,
  onBeginNodeDrag,
  onHoverAsRelationshipTarget,
  clientToModelPoint,
  onStartLinkDrag,
}: Props) {
  const selfRef: ConnectableRef = { kind: 'connector', id: c.id };

  const isRelTarget = Boolean(linkDrag && sameRef(linkDrag.targetRef, selfRef) && !sameRef(linkDrag.sourceRef, selfRef));
  const isRelSource = Boolean(linkDrag && sameRef(linkDrag.sourceRef, selfRef));

  const w = n.width ?? 24;
  const h = n.height ?? 24;

  // Minimal representation: AND junction = circle; OR junction = diamond.
  const shape = c.type === 'OrJunction' ? 'diamond' : 'circle';

  return (
    <div
      className={
        'diagramConnectorNode' +
        (isSelected ? ' isSelected' : '') +
        (n.highlighted ? ' isHighlighted' : '') +
        (isRelTarget ? ' isRelTarget' : '') +
        (isRelSource ? ' isRelSource' : '')
      }
      style={
        {
          left: n.x,
          top: n.y,
          width: w,
          height: h,
          zIndex: n.zIndex,
        } as React.CSSProperties
      }
      role="button"
      tabIndex={0}
      aria-label={`Connector ${c.type}`}
      title={c.type}
      onClick={() => {
        if (linkDrag) return;
        onSelect({ kind: 'connector', connectorId: c.id });
      }}
      onPointerDown={(e) => {
        if (linkDrag) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onBeginNodeDrag({
          viewId: activeViewId,
          ref: selfRef,
          startX: e.clientX,
          startY: e.clientY,
          origX: n.x,
          origY: n.y,
        });
      }}
      onPointerEnter={() => {
        if (!linkDrag) return;
        if (sameRef(linkDrag.sourceRef, selfRef)) return;
        onHoverAsRelationshipTarget(selfRef);
      }}
      onPointerLeave={() => {
        if (!linkDrag) return;
        if (sameRef(linkDrag.targetRef, selfRef)) onHoverAsRelationshipTarget(null);
      }}
    >
      <div className={'diagramConnectorShape diagramConnectorShape--' + shape} aria-hidden="true" />

      <button
        type="button"
        className="diagramRelHandle diagramRelHandle--connector"
        aria-label={`Create relationship from ${c.type}`}
        title="Drag to a node to create a relationship"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);

          const sourcePoint: Point = { x: n.x + w, y: n.y + h };
          const p = clientToModelPoint(e.clientX, e.clientY) ?? sourcePoint;

          onStartLinkDrag({
            viewId: activeViewId,
            sourceRef: selfRef,
            sourcePoint,
            currentPoint: p,
            targetRef: null,
          });
        }}
      >
        ↗
      </button>
    </div>
  );
}
