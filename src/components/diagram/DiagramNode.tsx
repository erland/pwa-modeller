import type * as React from 'react';
import type { Element, ViewNodeLayout } from '../../domain';
import type { Selection } from '../model/selection';
import { ArchimateSymbol } from './archimateSymbols';
import type { Point } from './geometry';

export type DiagramLinkDrag = {
  viewId: string;
  sourceElementId: string;
  sourcePoint: Point;
  currentPoint: Point;
  targetElementId: string | null;
};

export type DiagramNodeDragState = {
  viewId: string;
  elementId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
};

type Props = {
  node: ViewNodeLayout;
  element: Element;
  activeViewId: string;
  isSelected: boolean;
  linkDrag: DiagramLinkDrag | null;
  /** Value assigned to CSS var --diagram-node-bg */
  bgVar: string;
  onSelect: (selection: Selection) => void;

  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
  onHoverAsRelationshipTarget: (elementId: string | null) => void;

  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onStartLinkDrag: (drag: DiagramLinkDrag) => void;
};

export function DiagramNode({
  node: n,
  element: el,
  activeViewId,
  isSelected,
  linkDrag,
  bgVar,
  onSelect,
  onBeginNodeDrag,
  onHoverAsRelationshipTarget,
  clientToModelPoint,
  onStartLinkDrag,
}: Props) {
  const typeLabel =
    el.type === 'Unknown'
      ? el.unknownType?.name
        ? `Unknown: ${el.unknownType.name}`
        : 'Unknown'
      : el.type;

  const isRelTarget = Boolean(linkDrag && linkDrag.targetElementId === n.elementId && linkDrag.sourceElementId !== n.elementId);
  const isRelSource = Boolean(linkDrag && linkDrag.sourceElementId === n.elementId);

  return (
    <div
      className={
        'diagramNode' +
        (isSelected ? ' isSelected' : '') +
        (n.highlighted ? ' isHighlighted' : '') +
        (isRelTarget ? ' isRelTarget' : '') +
        (isRelSource ? ' isRelSource' : '')
      }
      style={
        {
          left: n.x,
          top: n.y,
          width: n.width ?? 120,
          height: n.height ?? 60,
          zIndex: n.zIndex,
          '--diagram-node-bg': bgVar,
        } as React.CSSProperties
      }
      role="button"
      tabIndex={0}
      aria-label={`Diagram node ${el.name || '(unnamed)'}`}
      onClick={() => {
        if (linkDrag) return;
        onSelect({ kind: 'viewNode', viewId: activeViewId, elementId: el.id });
      }}
      onPointerDown={(e) => {
        if (linkDrag) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onBeginNodeDrag({
          viewId: activeViewId,
          elementId: el.id,
          startX: e.clientX,
          startY: e.clientY,
          origX: n.x,
          origY: n.y,
        });
      }}
      onPointerEnter={() => {
        if (!linkDrag) return;
        if (n.elementId === linkDrag.sourceElementId) return;
        onHoverAsRelationshipTarget(n.elementId);
      }}
      onPointerLeave={() => {
        if (!linkDrag) return;
        if (linkDrag.targetElementId === n.elementId) onHoverAsRelationshipTarget(null);
      }}
    >
      {/* Node content (label offsets apply here, not to the handle) */}
      <div
        className="diagramNodeContent"
        style={n.label ? { transform: `translate(${n.label.dx}px, ${n.label.dy}px)` } : undefined}
      >
        <div className="diagramNodeHeader">
          <div className="diagramNodeSymbol" aria-hidden="true">
            <ArchimateSymbol
              type={el.type}
              title={
                el.type === 'Unknown'
                  ? el.unknownType?.name
                    ? `Unknown: ${el.unknownType.name}`
                    : 'Unknown'
                  : el.type
              }
            />
          </div>
          <div className="diagramNodeTitle">{el.name || '(unnamed)'}</div>
        </div>
        <div className="diagramNodeMeta">{typeLabel}</div>
        {n.styleTag ? <div className="diagramNodeTag">{n.styleTag}</div> : null}
      </div>

      {/* Outgoing relationship handle */}
      <button
        type="button"
        className="diagramRelHandle"
        aria-label={`Create relationship from ${el.name || '(unnamed)'}`}
        title="Drag to another element to create a relationship"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);

          // Start the drag from the bottom-right corner (matches the handle position)
          const sourcePoint: Point = { x: n.x + (n.width ?? 120), y: n.y + (n.height ?? 60) };
          const p = clientToModelPoint(e.clientX, e.clientY) ?? sourcePoint;

          onStartLinkDrag({
            viewId: activeViewId,
            sourceElementId: el.id,
            sourcePoint,
            currentPoint: p,
            targetElementId: null,
          });
        }}
      >
        ↗
      </button>
    </div>
  );
}
