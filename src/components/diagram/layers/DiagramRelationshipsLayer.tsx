import { useMemo } from 'react';
import type { Model, ViewConnection, ViewNodeLayout } from '../../../domain';
import type { Notation } from '../../../notations';
import type { Selection } from '../../model/selection';
import { RelationshipMarkers } from '../RelationshipMarkers';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { GroupBoxDraft } from '../hooks/useDiagramToolState';
import type { Point } from '../geometry';
import {
  nodeRefFromLayout,
  offsetPolyline,
  polylineMidPoint,
  rectAlignedOrthogonalAnchors,
  unitPerp,
} from '../geometry';
import { getConnectionPath } from '../connectionPath';
import { applyLaneOffsetsSafely } from '../connectionLanes';
import { orthogonalRoutingHintsFromAnchors } from '../orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../adjustConnectionEndpoints';
import { refKey } from '../connectable';
import { markerUrl } from '../../../diagram/relationships/markers';
import { dasharrayForPattern } from '../../../diagram/relationships/style';

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
  notation: Notation;
  /** Active view id (used for per-view connection properties like routing). */
  viewId?: string;
  /** Grid size used when choosing routing channels for orthogonal connections. */
  gridSize?: number;
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
  notation,
  viewId,
  gridSize,
  nodes,
  connectionRenderItems,
  surfaceWidthModel,
  surfaceHeightModel,
  selection,
  linkDrag,
  groupBoxDraft,
  onSelect,
}: Props) {
  const nodeRect = (n: ViewNodeLayout) => {
    const isConnector = Boolean(n.connectorId);
    const w = n.width ?? (isConnector ? 24 : 120);
    const h = n.height ?? (isConnector ? 24 : 60);
    return { x: n.x, y: n.y, w, h };
  };

  // Precompute routed polylines for all connections and apply cheap lane offsets for
  // connections that share a similar corridor (helps avoid visually merging lines).
  const pointsByConnectionId = useMemo(() => {
    const laneItems: Array<{ id: string; points: Point[] }> = [];
    const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const s = item.source;
      const t = item.target;
      const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
      const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };
      const { start, end } = rectAlignedOrthogonalAnchors(s, t);

      const sKey = refKey(nodeRefFromLayout(s)!);
      const tKey = refKey(nodeRefFromLayout(t)!);
      const obstacles = nodes
        .filter((n) => {
          const r = nodeRefFromLayout(n);
          if (!r) return false;
          const k = refKey(r);
          return k !== sKey && k !== tKey;
        })
        .map(nodeRect);

      obstaclesById.set(conn.id, obstacles);

      const hints = {
        ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
        obstacles,
        obstacleMargin: gridSize ? gridSize / 2 : 10,
      };
      let points: Point[] = getConnectionPath(conn, { a: start, b: end, hints }).points;

      // If the router decided to start/end with an axis that doesn't match the original anchors,
      // snap endpoints to the implied node edges so the connection doesn't appear to "start from"
      // an unexpected side (e.g. horizontal segment starting at the top edge).
      if (conn.route.kind === 'orthogonal') {
        points = adjustOrthogonalConnectionEndpoints(points, s, t, { stubLength: gridSize ? gridSize / 2 : 10 });
      }

      const total = item.totalInGroup;
      if (total > 1) {
        const spacing = 14;
        const offsetIndex = item.indexInGroup - (total - 1) / 2;
        const offset = offsetIndex * spacing;
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

      laneItems.push({ id: conn.id, points });
    }

    const adjusted = applyLaneOffsetsSafely(laneItems, {
      gridSize,
      obstaclesById,
      obstacleMargin: gridSize ? gridSize / 2 : 10,
    });
    const map = new Map<string, Point[]>();
    for (const it of adjusted) map.set(it.id, it.points);
    return map;
  }, [connectionRenderItems, model, nodes, gridSize]);

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

        const points = pointsByConnectionId.get(conn.id);
        if (!points) return null;

        const total = item.totalInGroup;

        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

        const isSelected = selection.kind === 'relationship' && selection.relationshipId === relId;
        const style = notation.getRelationshipStyle(rel);
        const dasharray = style.line?.dasharray ?? dasharrayForPattern(style.line?.pattern);
        const markerStart = markerUrl(style.markerStart, isSelected);
        const markerEnd = markerUrl(style.markerEnd, isSelected);
        const mid = style.midLabel ? polylineMidPoint(points) : null;

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
              markerStart={markerStart}
              markerEnd={markerEnd}
              strokeDasharray={dasharray ?? undefined}
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
                {style.midLabel}
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
                markerEnd={markerUrl('arrowOpen', false)}
              />
            );
          })()
        : null}
    </svg>
  );
}
