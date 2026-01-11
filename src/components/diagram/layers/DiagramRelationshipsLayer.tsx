import type { Model, ViewConnection, ViewNodeLayout } from '../../../domain';
import type { Selection } from '../../model/selection';
import { RelationshipMarkers } from '../RelationshipMarkers';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { GroupBoxDraft } from '../hooks/useDiagramToolState';
import type { Point } from '../geometry';
import {
  nodeRefFromLayout,
  offsetPolyline,
  polylineMidPoint,
  rectEdgeAnchor,
  unitPerp,
} from '../geometry';
import { getConnectionPath } from '../connectionPath';
import { relationshipVisual } from '../relationshipVisual';
import { refKey } from '../connectable';

export type ConnectionRenderItem = {
  connection: ViewConnection;
  source: ViewNodeLayout;
  target: ViewNodeLayout;
  indexInGroup: number;
  totalInGroup: number;
  groupKey: string;
};

type Props = {
  model: Model;
  /** Active view id (used for per-view connection properties like routing). */
  viewId?: string;
  nodes: ViewNodeLayout[];
  connectionRenderItems: ConnectionRenderItem[];
  surfaceWidthModel: number;
  surfaceHeightModel: number;
  selection: Selection;
  linkDrag: DiagramLinkDrag | null;
  groupBoxDraft: GroupBoxDraft | null;
  onSelect: (sel: Selection) => void;
};

export function DiagramRelationshipsLayer({
  model,
  viewId,
  nodes,
  connectionRenderItems,
  surfaceWidthModel,
  surfaceHeightModel,
  selection,
  linkDrag,
  groupBoxDraft,
  onSelect,
}: Props) {
  return (
    <svg className="diagramRelationships" width={surfaceWidthModel} height={surfaceHeightModel} aria-label="Diagram relationships">
      <RelationshipMarkers />

      {groupBoxDraft ? (
        <rect
          x={Math.min(groupBoxDraft.start.x, groupBoxDraft.current.x)}
          y={Math.min(groupBoxDraft.start.y, groupBoxDraft.current.y)}
          width={Math.abs(groupBoxDraft.start.x - groupBoxDraft.current.x)}
          height={Math.abs(groupBoxDraft.start.y - groupBoxDraft.current.y)}
          fill="none"
          stroke="currentColor"
          strokeDasharray="6 4"
          opacity={0.55}
        />
      ) : null}

      {connectionRenderItems.map((item) => {
        const conn = item.connection;
        const relId = conn.relationshipId;
        const rel = model.relationships[relId];
        if (!rel) return null;

        const s = item.source;
        const t = item.target;

        const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
        const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };

        // Prefer border anchors (looks nicer than center-to-center).
        const start = rectEdgeAnchor(s, tc);
        const end = rectEdgeAnchor(t, sc);

        // Centralized routing (straight/orthogonal) using ViewConnection.
        let points: Point[] = getConnectionPath(conn, { a: start, b: end }).points;

        // If there are multiple relationships between the same two elements, offset them in parallel.
        const total = item.totalInGroup;
        if (total > 1) {
          const spacing = 14;
          const offsetIndex = item.indexInGroup - (total - 1) / 2;
          const offset = offsetIndex * spacing;

          // Use a stable perpendicular based on the unordered group key so
          // relationships in opposite directions still spread apart consistently.
          const parts = item.groupKey.split('|');
          const aNode = nodes.find((n) => {
            const r = nodeRefFromLayout(n);
            return r ? refKey(r) === parts[0] : false;
          });
          const bNode = nodes.find((n) => {
            const r = nodeRefFromLayout(n);
            return r ? refKey(r) === parts[1] : false;
          });
          const aC: Point | null = aNode ? { x: aNode.x + (aNode.width ?? 120) / 2, y: aNode.y + (aNode.height ?? 60) / 2 } : null;
          const bC: Point | null = bNode ? { x: bNode.x + (bNode.width ?? 120) / 2, y: bNode.y + (bNode.height ?? 60) / 2 } : null;
          const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
          points = offsetPolyline(points, perp, offset);
        }

        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

        const isSelected = selection.kind === 'relationship' && selection.relationshipId === relId;
        const v = relationshipVisual(rel, isSelected);
        const mid = v.midLabel ? polylineMidPoint(points) : null;

        return (
          <g key={conn.id}>
            {/*
              Large invisible hit target so relationships are easy to select.
              (The visible line itself has pointer-events disabled.)
            */}

            <path
              className="diagramRelHit"
              d={d}
              style={{ strokeWidth: total > 1 ? 10 : 14 }}
              onClick={(e) => {
                if (linkDrag) return;
                e.preventDefault();
                e.stopPropagation();
                onSelect({ kind: 'relationship', relationshipId: relId, viewId });
              }}
            />
            <path
              className={'diagramRelLine' + (isSelected ? ' isSelected' : '')}
              d={d}
              markerStart={v.markerStart}
              markerEnd={v.markerEnd}
              strokeDasharray={v.dasharray ?? undefined}
            />

            {mid ? (
              <text
                x={mid.x}
                y={mid.y - 6}
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
                fontSize={12}
                fontWeight={800}
                fill="rgba(0,0,0,0.65)"
                textAnchor="middle"
                pointerEvents="none"
              >
                {v.midLabel}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Link creation preview */}
      {linkDrag
        ? (() => {
            const start = linkDrag.sourcePoint;
            let end = linkDrag.currentPoint;
            if (linkDrag.targetRef) {
              const key = refKey(linkDrag.targetRef);
              const t = nodes.find((n) => {
                const r = nodeRefFromLayout(n);
                return r ? refKey(r) === key : false;
              });
              if (t) end = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
            }
            const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            return (
              <path
                key="__preview__"
                d={d}
                fill="none"
                stroke="var(--diagram-rel-stroke)"
                strokeWidth={2}
                strokeDasharray="6 5"
                markerEnd="url(#arrowOpen)"
              />
            );
          })()
        : null}
    </svg>
  );
}
