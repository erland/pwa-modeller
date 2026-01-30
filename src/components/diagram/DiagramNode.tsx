import type * as React from 'react';
import type { Element, ViewNodeLayout } from '../../domain';
import type { Notation } from '../../notations';
import type { Point } from './geometry';
import type { ConnectableRef } from './connectable';
import { sameRef } from './connectable';

export type DiagramLinkDrag = {
  viewId: string;
  sourceRef: ConnectableRef;
  sourcePoint: Point;
  currentPoint: Point;
  targetRef: ConnectableRef | null;
};

export type DiagramDragRef =
  | ConnectableRef
  | {
      kind: 'object';
      id: string;
    };

export type DiagramNodeDragState = {
  viewId: string;
  ref: DiagramDragRef;
  action: 'move' | 'resize';
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  /** Optional batch move payload (multi-select drag). Present only for action='move'. */
  batch?: Array<{
    ref: DiagramDragRef;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    locked?: boolean;
  }>;
  /** Whether the primary dragged node is locked. */
  locked?: boolean;
};

type Props = {
  node: ViewNodeLayout;
  element: Element;
  activeViewId: string;
  notation: Notation;
  isSelected: boolean;
  linkDrag: DiagramLinkDrag | null;
  /** Value assigned to CSS var --diagram-node-bg */
  bgVar: string;
  onSelectNode: (viewId: string, elementId: string, additive: boolean) => void;

  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
  onHoverAsRelationshipTarget: (ref: ConnectableRef | null) => void;

  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onStartLinkDrag: (drag: DiagramLinkDrag) => void;
};

export function DiagramNode({
  node: n,
  element: el,
  activeViewId,
  notation,
  isSelected,
  linkDrag,
  bgVar,
  onSelectNode,
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

  const selfRef: ConnectableRef = { kind: 'element', id: el.id };
  const isRelTarget = Boolean(linkDrag && sameRef(linkDrag.targetRef, selfRef) && !sameRef(linkDrag.sourceRef, selfRef));
  const isRelSource = Boolean(linkDrag && sameRef(linkDrag.sourceRef, selfRef));

  const w = n.width ?? 120;
  const h = n.height ?? 60;

  // UML activity diagrams: some node types render their own shape (diamond/circle/bar).
  // We attach a CSS modifier class based on view-local node attrs to allow shape-specific styling.
  const umlShape = (() => {
    if (notation.kind !== 'uml') return null;
    const attrs = (n as unknown as { attrs?: unknown }).attrs;
    if (!attrs || typeof attrs !== 'object') return null;
    const shape = (attrs as Record<string, unknown>).umlShape;
    return typeof shape === 'string' ? shape : null;
  })();

  return (
    <div
      className={
        'diagramNode' +
        (umlShape ? ` diagramNode--uml-${umlShape}` : '') +
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
          '--diagram-node-bg': bgVar,
        } as React.CSSProperties
      }
      role="button"
      tabIndex={0}
      aria-label={`Diagram node ${el.name || '(unnamed)'}`}
      onClick={(e) => {
        if (linkDrag) return;
        onSelectNode(activeViewId, el.id, Boolean(e.shiftKey));
      }}
      onPointerDown={(e) => {
        if (linkDrag) return;
        if (e.pointerType !== 'mouse') {
          e.preventDefault();
          e.stopPropagation();
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        onBeginNodeDrag({
          viewId: activeViewId,
          ref: selfRef,
          action: 'move',
          startX: e.clientX,
          startY: e.clientY,
          origX: n.x,
          origY: n.y,
          origW: w,
          origH: h,
          locked: Boolean(n.locked),
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
      {/* Node content (label offsets apply here, not to the handle) */}
      <div
        className="diagramNodeContent"
        style={
          {
            ...(n.label ? { transform: `translate(${n.label.dx}px, ${n.label.dy}px)` } : null),
            ...(notation.renderNodeContent ? { height: '100%' } : null),
          } as React.CSSProperties
        }
      >
        {notation.renderNodeContent ? (
          notation.renderNodeContent({ element: el, node: n })
        ) : (
          <>
            <div className="diagramNodeHeader">
              <div className="diagramNodeSymbol" aria-hidden="true">
                {notation.renderNodeSymbol({
                  nodeType: el.type,
                  title:
                    el.type === 'Unknown'
                      ? el.unknownType?.name
                        ? `Unknown: ${el.unknownType.name}`
                        : 'Unknown'
                      : el.type,
                })}
              </div>
              <div className="diagramNodeTitle">{el.name || '(unnamed)'}</div>
            </div>
            <div className="diagramNodeMeta">{typeLabel}</div>
            {n.styleTag ? <div className="diagramNodeTag">{n.styleTag}</div> : null}
          </>
        )}
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

          // Start the drag from the top-right corner (matches the handle position)
          const sourcePoint: Point = { x: n.x + w, y: n.y };
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

      {/* Resize handle (shown when selected) */}
      {isSelected ? (
        <div
          className="diagramResizeHandle"
          role="button"
          aria-label="Resize"
          onPointerDown={(e) => {
            if (linkDrag) return;
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            onBeginNodeDrag({
              viewId: activeViewId,
              ref: selfRef,
              action: 'resize',
              startX: e.clientX,
              startY: e.clientY,
              origX: n.x,
              origY: n.y,
              origW: w,
              origH: h,
            });
          }}
        />
      ) : null}
    </div>
  );
}
