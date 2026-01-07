import type * as React from 'react';
import type { ViewNodeLayout, ViewObject } from '../../domain';
import type { Selection } from '../model/selection';
import type { DiagramNodeDragState } from './DiagramNode';

type Props = {
  node: ViewNodeLayout;
  object: ViewObject;
  activeViewId: string;
  isSelected: boolean;
  onSelect: (selection: Selection) => void;
  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
};

function nodeText(obj: ViewObject): string {
  if (obj.type === 'GroupBox') return obj.name?.trim() || 'Group';
  if (obj.type === 'Divider') return '';
  return obj.text?.trim() || (obj.type === 'Label' ? 'Label' : 'Note');
}

export function DiagramViewObjectNode({ node: n, object: obj, activeViewId, isSelected, onSelect, onBeginNodeDrag }: Props) {
  const w = n.width ?? 200;
  const h = n.height ?? 120;

  const text = nodeText(obj);
  const isGroup = obj.type === 'GroupBox';
  const isDivider = obj.type === 'Divider';
  // Auto-orientation: a divider becomes vertical when its bounding box is taller than it is wide.
  const isDividerVertical = isDivider && h > w;
  const isLabel = obj.type === 'Label';
  const isNote = obj.type === 'Note';

  const style: React.CSSProperties = {
    left: n.x,
    top: n.y,
    width: w,
    height: h,
    zIndex: n.zIndex,
  };
  if (obj.style?.fill) style.background = obj.style.fill;
  if (obj.style?.stroke) style.borderColor = obj.style.stroke;
  if (obj.style?.textAlign) style.textAlign = obj.style.textAlign;

  const classes =
    'diagramViewObjectNode' +
    (isSelected ? ' isSelected' : '') +
    (n.highlighted ? ' isHighlighted' : '') +
    (isGroup ? ' diagramViewObjectNode--groupBox' : '') +
    (isLabel ? ' diagramViewObjectNode--label' : '') +
    (isNote ? ' diagramViewObjectNode--note' : '') +
    (isDivider ? ' diagramViewObjectNode--divider' : '');

  return (
    <div
      className={classes}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`View object ${obj.type}`}
      onClick={() => {
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: obj.id });
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onBeginNodeDrag({
          viewId: activeViewId,
          ref: { kind: 'object', id: obj.id },
          action: 'move',
          startX: e.clientX,
          startY: e.clientY,
          origX: n.x,
          origY: n.y,
          origW: w,
          origH: h,
        });
      }}
    >
      {isDivider ? (
        <div
          className="diagramDividerLine"
          style={
            isDividerVertical
              ? {
                  background: obj.style?.stroke || undefined,
                  left: '50%',
                  top: 0,
                  width: 2,
                  height: '100%',
                  transform: 'translateX(-1px)',
                }
              : {
                  background: obj.style?.stroke || undefined,
                }
          }
        />
      ) : isGroup ? (
        <div className="diagramViewObjectTitle">{text}</div>
      ) : (
        <div className="diagramViewObjectText">{text}</div>
      )}

      {/* Resize handle (MVP: note + group box) */}
      {!isLabel ? (
        <div
          className="diagramResizeHandle"
          role="button"
          aria-label="Resize"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            onBeginNodeDrag({
              viewId: activeViewId,
              ref: { kind: 'object', id: obj.id },
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
