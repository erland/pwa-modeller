import { useMemo } from 'react';
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
import { routeOrthogonalBatchWithSoftAvoidance, type PathfinderBatchRequest } from '../pathfinderSoftAvoid';
import { computeFanInPolylines, type FanInConnection } from '../fanInRouting';
import { applyLaneOffsetsSafely } from '../connectionLanes';
import { orthogonalRoutingHintsFromAnchors } from '../orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from '../adjustConnectionEndpoints';
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
    const isConnector = Boolean((n as any).connectorId);
    const w = n.width ?? (isConnector ? 24 : 120);
    const h = n.height ?? (isConnector ? 24 : 60);
    return { x: n.x, y: n.y, w, h };
  };

  const inferSideFromAnchor = (n: ViewNodeLayout, anchor: Point): 'left' | 'right' | 'top' | 'bottom' => {
    const r = nodeRect(n);
    const left = Math.abs(anchor.x - r.x);
    const right = Math.abs(anchor.x - (r.x + r.w));
    const top = Math.abs(anchor.y - r.y);
    const bottom = Math.abs(anchor.y - (r.y + r.h));
    const min = Math.min(left, right, top, bottom);
    if (min === left) return 'left';
    if (min === right) return 'right';
    if (min === top) return 'top';
    return 'bottom';
  };

  // Precompute routed polylines for all connections and apply cheap lane offsets for
  // connections that share a similar corridor (helps avoid visually merging lines).
  const pointsByConnectionId = useMemo(() => {
    const laneItems: Array<{ id: string; points: Point[]; targetKey?: string; targetSide?: 'left' | 'right' | 'top' | 'bottom' }> = [];
    const basePoints = new Map<string, Point[]>();
    const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();
    const fanInCandidates: FanInConnection[] = [];

    // Sequential pathfinder routing with soft avoidance to reduce collisions between connections.
    // This is deterministic (sorted by connection id) and is applied only to orthogonal auto-routed connections.
    const pfRequests: PathfinderBatchRequest[] = [];
    const gs = gridSize ?? 20;
    const stubLength = Math.max(6, Math.floor(gs / 2));
    const clearance = Math.max(6, Math.floor(gs / 2));
    const softRadius = Math.max(4, Math.floor(gs / 3));
    const softPenalty = gs * 8;

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      if (conn.route.kind !== 'orthogonal' || conn.points) continue;

      const s = item.source;
      const t = item.target;

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

      // Keep obstacles available for lane-safety checks as well.
      obstaclesById.set(conn.id, obstacles);

      pfRequests.push({
        id: conn.id,
        sourceRect: nodeRect(s),
        targetRect: nodeRect(t),
        obstacles,
        options: { gridSize: gs, clearance, stubLength, coordPaddingSteps: 2 },
      });
    }

    const pfMap = routeOrthogonalBatchWithSoftAvoidance(pfRequests, {
      softRadius,
      softPenalty,
      skipEndpointSegments: 1,
    });

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      const rel = model.relationships[conn.relationshipId];
      if (!rel) continue;

      const s = item.source;
      const t = item.target;
      const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
      const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };
      const start = rectEdgeAnchor(s, tc);
      const end = rectEdgeAnchor(t, sc);

      const sKey = refKey(nodeRefFromLayout(s)!);
      const tKey = refKey(nodeRefFromLayout(t)!);
      const targetSide = inferSideFromAnchor(t, end);
      const obstacles = obstaclesById.get(conn.id) ?? nodes
        .filter((n) => {
          const r = nodeRefFromLayout(n);
          if (!r) return false;
          const k = refKey(r);
          return k !== sKey && k !== tKey;
        })
        .map(nodeRect);

      if (!obstaclesById.has(conn.id)) obstaclesById.set(conn.id, obstacles);

      let usedPathfinder = false;
      let points: Point[] | null = null;

      // Prefer the full pathfinder result (with soft avoidance) for orthogonal auto routes.
      if (conn.route.kind === 'orthogonal' && !conn.points) {
        const pf = pfMap.get(conn.id);
        if (pf) {
          points = pf;
          usedPathfinder = true;
        }
      }

      if (!points) {
        const hints = {
          ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
          obstacles,
          obstacleMargin: gridSize ? gridSize / 2 : 10,
        };
        points = getConnectionPath(conn, { a: start, b: end, hints }).points;

        // If the router decided to start/end with an axis that doesn't match the original anchors,
        // snap endpoints to the implied node edges so the connection doesn't appear to "start from"
        // an unexpected side (e.g. horizontal segment starting at the top edge).
        if (conn.route.kind === 'orthogonal') {
          points = adjustOrthogonalConnectionEndpoints(points, s, t, { stubLength: gridSize ? gridSize / 2 : 10 });
        }
      }

      if (!points) continue;


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

      basePoints.set(conn.id, points);

      if (conn.route.kind === 'orthogonal' && !usedPathfinder) {
        fanInCandidates.push({ id: conn.id, viewId: conn.viewId, targetKey: tKey, points, targetRect: nodeRect(t), targetSide });
      }

      if (!usedPathfinder) {
        laneItems.push({ id: conn.id, points, targetKey: tKey, targetSide });
      }
    }

        // Fan-in routing (dock + approach lanes) for connections that share the same target side.
    const targetKeysSet = new Set(fanInCandidates.map((c) => c.targetKey));
    const fanInObstacles = nodes
      .filter((n) => {
        const r = nodeRefFromLayout(n);
        if (!r) return false;
        const k = refKey(r);
        return !targetKeysSet.has(k);
      })
      .map(nodeRect);

    const fanInMap = computeFanInPolylines(fanInCandidates, {
      gridSize,
      stubLength: gridSize ? gridSize / 2 : 10,
      obstacles: fanInObstacles,
      obstacleMargin: gridSize ? gridSize / 2 : 10,
    });

    const fanInIds = new Set(fanInMap.keys());
    const laneInput = laneItems.filter((it) => !fanInIds.has(it.id));

    const adjusted = applyLaneOffsetsSafely(laneInput, {
      gridSize,
      stubLength: gridSize ? gridSize / 2 : 10,
      obstaclesById,
      obstacleMargin: gridSize ? gridSize / 2 : 10,
    });
    const map = new Map<string, Point[]>(basePoints);
    for (const it of adjusted) map.set(it.id, it.points);
    for (const [id, pts] of fanInMap) map.set(id, pts);
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
