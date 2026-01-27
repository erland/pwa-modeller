import type { Model, View, ViewNodeLayout, ViewObject } from '../../../domain';
import type { Notation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { DiagramNode, type DiagramLinkDrag, type DiagramNodeDragState } from '../DiagramNode';
import { DiagramConnectorNode } from '../DiagramConnectorNode';
import { DiagramViewObjectNode } from '../DiagramViewObjectNode';
import type { ConnectableRef } from '../connectable';
import type { Point } from '../geometry';

type Props = {
  model: Model;
  activeView: View;
  notation: Notation;
  nodes: ViewNodeLayout[];
  selection: Selection;
  linkDrag: DiagramLinkDrag | null;
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onSelect: (sel: Selection) => void;
  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
  onHoverAsRelationshipTarget: (ref: ConnectableRef | null) => void;
  onStartLinkDrag: (drag: DiagramLinkDrag) => void;
  getElementBgVar: (t: string) => string;
};

export function DiagramNodesLayer({
  model,
  activeView,
  notation,
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
  const handleSelectNode = (viewId: string, elementId: string, additive: boolean): void => {
    if (!additive) {
      onSelect({ kind: 'viewNode', viewId, elementId });
      return;
    }

    // Shift+click toggles membership.
    if (selection.kind === 'viewNode' && selection.viewId === viewId) {
      if (selection.elementId === elementId) {
        onSelect({ kind: 'none' });
      } else {
        const ids = [selection.elementId, elementId];
        onSelect({ kind: 'viewNodes', viewId, elementIds: ids });
      }
      return;
    }

    if (selection.kind === 'viewNodes' && selection.viewId === viewId) {
      const ids = selection.elementIds.slice();
      const idx = ids.indexOf(elementId);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(elementId);

      if (ids.length === 0) {
        onSelect({ kind: 'none' });
      } else if (ids.length === 1) {
        onSelect({ kind: 'viewNode', viewId, elementId: ids[0] });
      } else {
        onSelect({ kind: 'viewNodes', viewId, elementIds: ids });
      }
      return;
    }

    // If selection is from another view or another kind, start a fresh selection.
    onSelect({ kind: 'viewNode', viewId, elementId });
  };

  return (
    <div className="diagramNodesLayer">
      {nodes.map((n) => {
        if (n.elementId) {
          const el = model.elements[n.elementId];
          if (!el) return null;

          const bgVar = getElementBgVar(el.type);

          const isSelected =
            (selection.kind === 'viewNode' &&
              selection.viewId === activeView.id &&
              selection.elementId === n.elementId) ||
            (selection.kind === 'viewNodes' &&
              selection.viewId === activeView.id &&
              selection.elementIds.includes(n.elementId));

          return (
            <DiagramNode
              key={`${activeView.id}:${n.elementId}`}
              node={n}
              element={el}
              notation={notation}
              activeViewId={activeView.id}
              isSelected={isSelected}
              linkDrag={linkDrag}
              bgVar={bgVar}
              onSelectNode={handleSelectNode}
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
          const objects = (activeView.objects ?? {}) as Record<string, ViewObject>;
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
    </div>
  );
}