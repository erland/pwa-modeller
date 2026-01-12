import type * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ArchimateLayer, ElementType, Model, RelationshipType, View, ViewNodeLayout } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, createConnector, getDefaultViewObjectSize } from '../../domain';
import { downloadTextFile, modelStore, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';
import { Dialog } from '../dialog/Dialog';
import { createViewSvg } from './exportSvg';
import { boundsForNodes, distancePointToPolyline, nodeRefFromLayout, offsetPolyline, rectEdgeAnchor, unitPerp } from './geometry';
import type { Point } from './geometry';
import { dataTransferHasElement, readDraggedElementId } from './dragDrop';
import type { ConnectableRef } from './connectable';
import { refKey } from './connectable';
import { getConnectionPath } from './connectionPath';
import { routeOrthogonalBatchWithSoftAvoidance, type PathfinderBatchRequest } from './pathfinderSoftAvoid';
import { applyLaneOffsetsSafely } from './connectionLanes';
import { computeFanInPolylines, type FanInConnection, type Rect as FanInRect } from './fanInRouting';
import { orthogonalRoutingHintsFromAnchors } from './orthogonalHints';
import { adjustOrthogonalConnectionEndpoints } from './adjustConnectionEndpoints';

import { useActiveViewId } from './hooks/useActiveViewId';
import { useDiagramViewport } from './hooks/useDiagramViewport';
import { useDiagramToolState } from './hooks/useDiagramToolState';
import { useDiagramNodeDrag } from './hooks/useDiagramNodeDrag';
import { useDiagramRelationshipCreation } from './hooks/useDiagramRelationshipCreation';

import { DiagramNodesLayer } from './layers/DiagramNodesLayer';
import { DiagramRelationshipsLayer, type ConnectionRenderItem } from './layers/DiagramRelationshipsLayer';

type Props = {
  selection: Selection;
  onSelect: (sel: Selection) => void;
};

const ELEMENT_TYPE_TO_LAYER: Partial<Record<ElementType, ArchimateLayer>> = (() => {
  const map: Partial<Record<ElementType, ArchimateLayer>> = {};
  (Object.keys(ELEMENT_TYPES_BY_LAYER) as ArchimateLayer[]).forEach((layer) => {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer] ?? []) map[t] = layer;
  });
  return map;
})();

const LAYER_BG_VAR: Record<ArchimateLayer, string> = {
  Strategy: 'var(--arch-layer-strategy)',
  Motivation: 'var(--arch-layer-motivation)',
  Business: 'var(--arch-layer-business)',
  Application: 'var(--arch-layer-application)',
  Technology: 'var(--arch-layer-technology)',
  Physical: 'var(--arch-layer-physical)',
  ImplementationMigration: 'var(--arch-layer-implementation)',
};

function sortViews(views: Record<string, View>): View[] {
  return Object.values(views).sort((a, b) => a.name.localeCompare(b.name));
}

export function DiagramCanvas({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model) as Model | null;

  const views = useMemo(() => (model ? sortViews(model.views) : []), [model]);

  const { activeViewId } = useActiveViewId(model, views, selection);
  const activeView = model && activeViewId ? model.views[activeViewId] : null;

  const canExportImage = Boolean(model && activeViewId && activeView);

  const handleExportImage = useCallback(() => {
    if (!model || !activeViewId) return;
    const svg = createViewSvg(model, activeViewId);
    const base = `${model.metadata.name}-${activeView?.name || 'view'}`;
    const fileName = sanitizeFileNameWithExtension(base, 'svg');
    downloadTextFile(fileName, svg, 'image/svg+xml');
  }, [model, activeViewId, activeView]);

  const nodes: ViewNodeLayout[] = useMemo(
    () =>
      (activeView?.layout?.nodes ?? []).map((n, idx) => {
        const isConn = Boolean(n.connectorId);
        const isObj = Boolean(n.objectId);
        const objects = (activeView?.objects ?? {}) as Record<string, any>;
        const obj = isObj ? objects[n.objectId!] : undefined;

        let width = n.width;
        let height = n.height;
        if (typeof width !== 'number' || typeof height !== 'number') {
          if (isConn) {
            width = typeof width === 'number' ? width : 24;
            height = typeof height === 'number' ? height : 24;
          } else if (isObj && obj) {
            const d = getDefaultViewObjectSize(obj.type);
            width = typeof width === 'number' ? width : d.width;
            height = typeof height === 'number' ? height : d.height;
          } else {
            width = typeof width === 'number' ? width : 120;
            height = typeof height === 'number' ? height : 60;
          }
        }

        let zIndex = typeof n.zIndex === 'number' ? n.zIndex : idx;
        if (isObj && obj?.type === 'GroupBox' && typeof n.zIndex !== 'number') zIndex = idx - 10000;

        return { ...n, width, height, zIndex };
      }),
    [activeView]
  );

  const bounds = useMemo(() => boundsForNodes(nodes), [nodes]);

  const surfacePadding = 120;
  const surfaceWidthModel = Math.max(800, bounds.maxX + surfacePadding);
  const surfaceHeightModel = Math.max(420, bounds.maxY + surfacePadding);

  const { viewportRef, surfaceRef, zoom, zoomIn, zoomOut, zoomReset, fitToView, clientToModelPoint } = useDiagramViewport({
    activeViewId,
    activeView,
    bounds,
    hasNodes: nodes.length > 0,
    surfacePadding,
  });

  const { toolMode, setToolMode, groupBoxDraft, onSurfacePointerDownCapture } = useDiagramToolState({
    model,
    activeViewId,
    activeView,
    clientToModelPoint,
    onSelect,
  });

  const { beginNodeDrag } = useDiagramNodeDrag(zoom);

  const rel = useDiagramRelationshipCreation({
    model,
    nodes,
    clientToModelPoint,
    onSelect,
  });

  const [isDragOver, setIsDragOver] = useState(false);

  const getElementBgVar = useCallback((t: ElementType) => {
    const layer = ELEMENT_TYPE_TO_LAYER[t] ?? 'Business';
    return LAYER_BG_VAR[layer];
  }, []);

  function handleViewportDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!activeViewId) return;
    if (!dataTransferHasElement(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }

  function handleViewportDragLeave() {
    setIsDragOver(false);
  }

  function handleViewportDrop(e: React.DragEvent<HTMLDivElement>) {
    setIsDragOver(false);
    if (!model || !activeViewId) return;
    const elementId = readDraggedElementId(e.dataTransfer);
    if (!elementId) return;
    if (!model.elements[elementId]) return;

    e.preventDefault();

    const vp = viewportRef.current;
    if (!vp) {
      modelStore.addElementToView(activeViewId, elementId);
      onSelect({ kind: 'viewNode', viewId: activeViewId, elementId });
      return;
    }

    const rect = vp.getBoundingClientRect();
    const x = (vp.scrollLeft + (e.clientX - rect.left)) / zoom;
    const y = (vp.scrollTop + (e.clientY - rect.top)) / zoom;

    modelStore.addElementToViewAt(activeViewId, elementId, x, y);
    onSelect({ kind: 'viewNode', viewId: activeViewId, elementId });
  }

  // Connections to render come from the view (ViewConnection), materialized on load/import.
  const connectionRenderItems: ConnectionRenderItem[] = useMemo(() => {
    if (!model || !activeView) return [];

    // Build a lookup of current view nodes by their connectable ref key.
    const nodeByKey = new Map<string, ViewNodeLayout>();
    for (const n of nodes) {
      const r = nodeRefFromLayout(n);
      if (r) nodeByKey.set(refKey(r), n);
    }

    // Group connections by unordered (A,B) endpoint pair so parallel lines are drawn
    // when multiple relationships exist between the same two nodes.
    const groups = new Map<string, typeof activeView.connections>();

    for (const conn of activeView.connections ?? []) {
      if (!model.relationships[conn.relationshipId]) continue;
      const a = refKey(conn.source as unknown as ConnectableRef);
      const b = refKey(conn.target as unknown as ConnectableRef);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const list = groups.get(key) ?? [];
      list.push(conn);
      groups.set(key, list);
    }

    const items: ConnectionRenderItem[] = [];
    for (const [groupKey, conns] of groups.entries()) {
      const stable = [...conns].sort((x, y) => x.id.localeCompare(y.id));
      for (let i = 0; i < stable.length; i += 1) {
        const conn = stable[i];
        const s = nodeByKey.get(refKey(conn.source as unknown as ConnectableRef));
        const t = nodeByKey.get(refKey(conn.target as unknown as ConnectableRef));
        if (!s || !t) continue;
        items.push({ connection: conn, source: s, target: t, indexInGroup: i, totalInGroup: stable.length, groupKey });
      }
    }

    return items;
  }, [model, activeView, nodes]);

  // Precompute connection polylines in model coordinates for hit-testing (select tool).
  const connectionHitItems = useMemo(() => {
    if (!model || !activeView) return [] as Array<{ relationshipId: string; connectionId: string; points: Point[] }>;
	    const items: Array<{ relationshipId: string; connectionId: string; points: Point[]; targetKey?: string; targetSide?: 'left' | 'right' | 'top' | 'bottom' }> = [];
	    const obstaclesById = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();
	    const fanInCandidates: FanInConnection[] = [];
	    // Track which connections were routed using the pathfinder so we can avoid running additional
	    // fan-in/lane post-processing on them.
	    const pathfinderIds = new Set<string>();
	    // Base polylines for hit-testing (after any per-connection offset such as parallel-edge offset).
	    const basePoints = new Map<string, Point[]>();

    const nodeRect = (n: ViewNodeLayout): FanInRect => {
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

    // Sequential pathfinder routing with soft avoidance to reduce collisions between connections.
    const gs = activeView.formatting?.gridSize ?? 20;
    const stubLength = Math.max(6, Math.floor(gs / 2));
    const clearance = Math.max(6, Math.floor(gs / 2));
    const softRadius = Math.max(4, Math.floor(gs / 3));
    const softPenalty = gs * 8;
    const pfRequests: PathfinderBatchRequest[] = [];

    for (const item of connectionRenderItems) {
      const conn = item.connection;
      if (conn.route.kind !== 'orthogonal' || conn.points) continue;

      const s = item.source;
      const t = item.target;

      const sRef = nodeRefFromLayout(s);
      const tRef = nodeRefFromLayout(t);
      if (!sRef || !tRef) continue;
      const sKey = refKey(sRef);
      const tKey = refKey(tRef);

      const obstacles = obstaclesById.get(conn.id) ?? nodes
        .filter((n) => {
          const r = nodeRefFromLayout(n);
          if (!r) return false;
          const k = refKey(r);
          return k !== sKey && k !== tKey;
        })
        .map(nodeRect);

      if (!obstaclesById.has(conn.id)) obstaclesById.set(conn.id, obstacles);

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

      const gridSize = activeView.formatting?.gridSize;

      let usedPathfinder = false;
      let points: Point[] | null = null;

      // Prefer the full pathfinder result (with soft avoidance) for orthogonal auto routes.
      if (conn.route.kind === 'orthogonal' && !conn.points) {
        const pf = pfMap.get(conn.id);
        if (pf) {
          points = pf;
          usedPathfinder = true;
          pathfinderIds.add(conn.id);
        }
      }

      if (!points) {
        const hints = {
          ...orthogonalRoutingHintsFromAnchors(s, start, t, end, gridSize),
          obstacles,
          obstacleMargin: gridSize ? gridSize / 2 : 10,
        };
        points = getConnectionPath(conn, { a: start, b: end, hints }).points;

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

      items.push({ relationshipId: conn.relationshipId, connectionId: conn.id, points, targetKey: tKey, targetSide });
    }

    // Fan-in routing (dock + approach lanes) for connections that share the same target side.
    const gridSize2 = activeView.formatting?.gridSize;
    const targetKeysSet = new Set(fanInCandidates.map((c) => c.targetKey));
    const fanInObstacles: FanInRect[] = nodes
      .filter((n) => {
        const r = nodeRefFromLayout(n);
        if (!r) return false;
        const k = refKey(r);
        return !targetKeysSet.has(k);
      })
      .map(nodeRect);

    const fanInMap = computeFanInPolylines(fanInCandidates, {
      gridSize: gridSize2,
      stubLength: gridSize2 ? gridSize2 / 2 : 10,
      obstacles: fanInObstacles,
      obstacleMargin: gridSize2 ? gridSize2 / 2 : 10,
    });

    const fanInIds = new Set(fanInMap.keys());
    const laneInput = items.filter((it) => !fanInIds.has(it.connectionId) && !pathfinderIds.has(it.connectionId));

    // Apply cheap lane offsets consistently with rendering/export.
    const adjusted = applyLaneOffsetsSafely(
      laneInput.map((it) => ({ id: it.connectionId, points: it.points, targetKey: it.targetKey, targetSide: it.targetSide })),
      {
        gridSize: gridSize2,
        stubLength: gridSize2 ? gridSize2 / 2 : 10,
        obstaclesById,
        obstacleMargin: gridSize2 ? gridSize2 / 2 : 10,
      }
    );
    const byId = new Map<string, Point[]>(basePoints);
    for (const a of adjusted) byId.set(a.id, a.points);
    for (const [id, pts] of fanInMap) byId.set(id, pts);

    return items.map((it) => ({ ...it, points: byId.get(it.connectionId) ?? it.points }));
  }, [model, activeView, connectionRenderItems, nodes]);

  const handleSurfacePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onSurfacePointerDownCapture(e);
      if (toolMode !== 'select') return;
      if (!model || !activeViewId || !activeView) return;
      if (rel.linkDrag) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('.diagramNode, .diagramConnectorNode, .diagramViewObjectNode, .diagramRelHit')) return;

      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;

      // Select the closest connection polyline within a small screen-space threshold.
      const thresholdModel = 10 / Math.max(0.0001, zoom);
      let best: { relationshipId: string; connectionId: string; points: Point[] } | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const item of connectionHitItems) {
        const d = distancePointToPolyline(p, item.points);
        if (d < bestDist) {
          bestDist = d;
          best = item;
        }
      }

      if (best && bestDist <= thresholdModel) {
        onSelect({ kind: 'relationship', relationshipId: best.relationshipId, viewId: activeViewId });
      } else {
        // Clicking empty space selects the view (useful for view-level properties).
        onSelect({ kind: 'view', viewId: activeViewId });
      }
    },
    [
      onSurfacePointerDownCapture,
      toolMode,
      model,
      activeViewId,
      activeView,
      rel.linkDrag,
      clientToModelPoint,
      zoom,
      connectionHitItems,
      onSelect,
    ]
  );


  if (!model) {
    return (
      <div aria-label="Diagram canvas" className="diagramCanvas">
        <div className="diagramEmpty">Create or open a model to start diagramming.</div>
      </div>
    );
  }

  return (
    <div className="diagramWrap">
      <div aria-label="Diagram toolbar" className="diagramToolbar">
        <div className="diagramToolbarTools" role="group" aria-label="Diagram tools">
          <button
            type="button"
            className={'shellButton' + (toolMode === 'select' ? ' isActive' : '')}
            onClick={() => setToolMode('select')}
            disabled={!activeViewId}
            title="Select tool"
          >
            Select
          </button>
          <button
            type="button"
            className={'shellButton' + (toolMode === 'addNote' ? ' isActive' : '')}
            onClick={() => setToolMode('addNote')}
            disabled={!activeViewId}
            title="Place a Note (click to drop)"
          >
            Note
          </button>
          <button
            type="button"
            className={'shellButton' + (toolMode === 'addLabel' ? ' isActive' : '')}
            onClick={() => setToolMode('addLabel')}
            disabled={!activeViewId}
            title="Place a Label (click to drop)"
          >
            Label
          </button>

          <button
            type="button"
            className={'shellButton' + (toolMode === 'addDivider' ? ' isActive' : '')}
            onClick={() => setToolMode('addDivider')}
            disabled={!activeViewId}
            title="Place a Divider/Separator (click to drop)"
          >
            Divider
          </button>
          <button
            type="button"
            className={'shellButton' + (toolMode === 'addGroupBox' ? ' isActive' : '')}
            onClick={() => setToolMode('addGroupBox')}
            disabled={!activeViewId}
            title="Place a Group box (drag to size)"
          >
            Group
          </button>
        </div>

        <div className="diagramToolbarButtons">
          <button className="shellButton" type="button" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
          <div className="diagramZoomLabel" aria-label="Zoom level">
            {Math.round(zoom * 100)}%
          </div>
          <button className="shellButton" type="button" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
          <button className="shellButton" type="button" onClick={zoomReset} aria-label="Reset zoom">
            100%
          </button>
          <button className="shellButton" type="button" onClick={fitToView} aria-label="Fit to view" disabled={!activeView || nodes.length === 0}>
            Fit
          </button>
          <button
            className="shellButton"
            type="button"
            disabled={!activeViewId}
            title="Add AND junction"
            onClick={() => {
              if (!model || !activeViewId) return;
              const conn = createConnector({ type: 'AndJunction' });
              modelStore.addConnector(conn);
              const vp = viewportRef.current;
              const cx = vp ? (vp.scrollLeft + vp.clientWidth / 2) / zoom : 100;
              const cy = vp ? (vp.scrollTop + vp.clientHeight / 2) / zoom : 100;
              modelStore.addConnectorToViewAt(activeViewId, conn.id, cx, cy);
            }}
          >
            +AND
          </button>
          <button
            className="shellButton"
            type="button"
            disabled={!activeViewId}
            title="Add OR junction"
            onClick={() => {
              if (!model || !activeViewId) return;
              const conn = createConnector({ type: 'OrJunction' });
              modelStore.addConnector(conn);
              const vp = viewportRef.current;
              const cx = vp ? (vp.scrollLeft + vp.clientWidth / 2) / zoom : 100;
              const cy = vp ? (vp.scrollTop + vp.clientHeight / 2) / zoom : 100;
              modelStore.addConnectorToViewAt(activeViewId, conn.id, cx, cy);
            }}
          >
            +OR
          </button>
          <button className="shellButton" type="button" onClick={handleExportImage} disabled={!canExportImage}>
            Export as Image
          </button>
        </div>
      </div>

      <div className="diagramCanvas">
        {views.length === 0 ? (
          <div className="diagramEmpty">Create a view from the left tree (Views ▸ Create…) to start placing elements.</div>
        ) : !activeView ? (
          <div className="diagramEmpty">Select a view to start diagramming.</div>
        ) : (
          <div
            className={'diagramViewport' + (isDragOver ? ' isDropTarget' : '')}
            ref={viewportRef}
            aria-label="Diagram canvas"
            onDragOver={handleViewportDragOver}
            onDragLeave={handleViewportDragLeave}
            onDrop={handleViewportDrop}
          >
            <div className="diagramHint">
              <span style={{ fontWeight: 700 }}>{activeView.name}</span>
              <span style={{ opacity: 0.8 }}>— drag nodes to reposition</span>
            </div>

            <div style={{ width: surfaceWidthModel * zoom, height: surfaceHeightModel * zoom, position: 'relative' }}>
              <div
                className="diagramSurface"
                ref={surfaceRef}
                onPointerDownCapture={handleSurfacePointerDownCapture}
                style={{
                  width: surfaceWidthModel,
                  height: surfaceHeightModel,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <DiagramRelationshipsLayer
                  model={model}
                  viewId={activeViewId ?? undefined}
                  gridSize={activeView?.formatting?.gridSize}
                  nodes={nodes}
                  connectionRenderItems={connectionRenderItems}
                  surfaceWidthModel={surfaceWidthModel}
                  surfaceHeightModel={surfaceHeightModel}
                  selection={selection}
                  linkDrag={rel.linkDrag}
                  groupBoxDraft={groupBoxDraft}
                  onSelect={onSelect}
                />

                <DiagramNodesLayer
                  model={model}
                  activeView={activeView}
                  nodes={nodes}
                  selection={selection}
                  linkDrag={rel.linkDrag}
                  clientToModelPoint={clientToModelPoint}
                  onSelect={onSelect}
                  onBeginNodeDrag={beginNodeDrag}
                  onHoverAsRelationshipTarget={rel.hoverAsRelationshipTarget}
                  onStartLinkDrag={rel.startLinkDrag}
                  getElementBgVar={getElementBgVar}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Relationship type picker shown after drag-drop */}
      <Dialog
        title="Create relationship"
        isOpen={Boolean(rel.pendingCreateRel)}
        onClose={rel.closePendingRelationshipDialog}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="shellButton" onClick={rel.closePendingRelationshipDialog}>
              Cancel
            </button>
            <button type="button" className="shellButton" onClick={rel.confirmCreatePendingRelationship}>
              Create
            </button>
          </div>
        }
      >
        {rel.pendingCreateRel && model ? (
          <div>
            <div style={{ opacity: 0.9, marginBottom: 10 }}>
              <div>
                <b>From:</b>{' '}
                {rel.pendingCreateRel.sourceRef.kind === 'element'
                  ? (model.elements[rel.pendingCreateRel.sourceRef.id]?.name ?? '—')
                  : (model.connectors?.[rel.pendingCreateRel.sourceRef.id]?.type ?? 'Connector')}
              </div>
              <div>
                <b>To:</b>{' '}
                {rel.pendingCreateRel.targetRef.kind === 'element'
                  ? (model.elements[rel.pendingCreateRel.targetRef.id]?.name ?? '—')
                  : (model.connectors?.[rel.pendingCreateRel.targetRef.id]?.type ?? 'Connector')}
              </div>
            </div>

            <label htmlFor="diagram-rel-type" style={{ display: 'block', marginBottom: 6 }}>
              Stereotype (relationship type)
            </label>
            <select
              id="diagram-rel-type"
              className="selectInput"
              value={rel.pendingRelType}
              onChange={(e) => rel.setPendingRelType(e.target.value as RelationshipType)}
            >
              {rel.pendingRelTypeOptions.map((rt) => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={rel.showAllPendingRelTypes}
                onChange={(e) => rel.setShowAllPendingRelTypes(e.target.checked)}
              />
              Show all relationship types (override validation)
            </label>

            {rel.pendingRelError ? (
              <div className="errorText" role="alert" style={{ marginTop: 10 }}>
                {rel.pendingRelError}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}