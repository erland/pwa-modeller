import type { ElementType, Model, View, ViewNodeLayout } from '../../../domain';
import type { Selection } from '../../model/selection';
import { DiagramNode, type DiagramLinkDrag, type DiagramNodeDragState } from '../DiagramNode';
import { DiagramConnectorNode } from '../DiagramConnectorNode';
import { DiagramViewObjectNode } from '../DiagramViewObjectNode';
import type { ConnectableRef } from '../connectable';
import type { Point } from '../geometry';

type Props = {
  model: Model;
  activeView: View;
  nodes: ViewNodeLayout[];
  selection: Selection;
  linkDrag: DiagramLinkDrag | null;
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onSelect: (sel: Selection) => void;
  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
  onHoverAsRelationshipTarget: (ref: ConnectableRef | null) => void;
  onStartLinkDrag: (drag: DiagramLinkDrag) => void;
  getElementBgVar: (t: ElementType) => string;
};

export function DiagramNodesLayer({
  model,
  activeView,
  nodes,
  selection,
  linkDrag,
  clientToModelPoint,
  onSelect,
  onBeginNodeDrag,
  onHoverAsRelationshipTarget,
  onStartLinkDrag,
  getElementBgVar,
}: Props) {
  return (
    <>
      {nodes.map((n) => {
        if (n.elementId) {
          const el = model.elements[n.elementId];
          if (!el) return null;

          const bgVar = getElementBgVar(el.type);

          const isSelected =
            selection.kind === 'viewNode' && selection.viewId === activeView.id && selection.elementId === n.elementId;

          return (
            <DiagramNode
              key={`${activeView.id}:${n.elementId}`}
              node={n}
              element={el}
              activeViewId={activeView.id}
              isSelected={isSelected}
              linkDrag={linkDrag}
              bgVar={bgVar}
              onSelect={onSelect}
              onBeginNodeDrag={onBeginNodeDrag}
              onHoverAsRelationshipTarget={onHoverAsRelationshipTarget}
              clientToModelPoint={clientToModelPoint}
              onStartLinkDrag={onStartLinkDrag}
            />
          );
        }

        if (n.connectorId) {
          const conn = model.connectors?.[n.connectorId];
          if (!conn) return null;
          const isSelected = selection.kind === 'connector' && selection.connectorId === n.connectorId;
          return (
            <DiagramConnectorNode
              key={`${activeView.id}:${n.connectorId}`}
              node={n}
              connector={conn}
              activeViewId={activeView.id}
              isSelected={isSelected}
              linkDrag={linkDrag}
              onSelect={onSelect}
              onBeginNodeDrag={onBeginNodeDrag}
              onHoverAsRelationshipTarget={onHoverAsRelationshipTarget}
              clientToModelPoint={clientToModelPoint}
              onStartLinkDrag={onStartLinkDrag}
            />
          );
        }

        if (n.objectId) {
          const objects = (activeView.objects ?? {}) as Record<string, any>;
          const obj = objects[n.objectId];
          if (!obj) return null;
          const isSelected =
            selection.kind === 'viewObject' && selection.viewId === activeView.id && selection.objectId === n.objectId;
          return (
            <DiagramViewObjectNode
              key={`${activeView.id}:${n.objectId}`}
              node={n}
              object={obj}
              activeViewId={activeView.id}
              isSelected={isSelected}
              onSelect={onSelect}
              onBeginNodeDrag={onBeginNodeDrag}
            />
          );
        }

        return null;
      })}
    </>
  );
}
