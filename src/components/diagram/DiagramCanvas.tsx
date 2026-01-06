import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {RelationshipType, View, ViewNodeLayout, ViewRelationshipLayout, ArchimateLayer, ElementType } from '../../domain';
import {RELATIONSHIP_TYPES, createRelationship, getViewpointById, validateRelationship, ELEMENT_TYPES_BY_LAYER } from '../../domain';
import { downloadTextFile, modelStore, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';
import { Dialog } from '../dialog/Dialog';
import { createViewSvg } from './exportSvg';
import { ArchimateSymbol } from './archimateSymbols';

type Props = {
  selection: Selection;
  onSelect: (sel: Selection) => void;
};

// Drag payload for dragging an element from the tree into a view.
const DND_ELEMENT_MIME = 'application/x-pwa-modeller-element-id';

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
  ImplementationMigration: 'var(--arch-layer-implementation)'
};


function dataTransferHasElement(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types ?? []);
  return types.includes(DND_ELEMENT_MIME) || types.includes('text/plain');
}

function readDraggedElementId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  const id = dt.getData(DND_ELEMENT_MIME) || dt.getData('text/plain');
  return id ? String(id) : null;
}

function sortViews(views: Record<string, View>): View[] {
  return Object.values(views).sort((a, b) => a.name.localeCompare(b.name));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

type Point = { x: number; y: number };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function boundsForNodes(nodes: ViewNodeLayout[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.width ?? 120));
    maxY = Math.max(maxY, n.y + (n.height ?? 60));
  }
  return { minX, minY, maxX, maxY };
}

function hitTestNodeId(nodes: ViewNodeLayout[], p: Point, excludeElementId: string | null): string | null {
  // Iterate from end to start so later-rendered nodes win if they overlap.
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i];
    if (excludeElementId && n.elementId === excludeElementId) continue;
    const w = n.width ?? 120;
    const h = n.height ?? 60;
    if (p.x >= n.x && p.x <= n.x + w && p.y >= n.y && p.y <= n.y + h) return n.elementId;
  }
  return null;
}

function rectEdgeAnchor(n: ViewNodeLayout, toward: Point): Point {
  // Returns a point on the rectangle border of node n in the direction of `toward`.
  const w = n.width ?? 120;
  const h = n.height ?? 60;
  const cx = n.x + w / 2;
  const cy = n.y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;

  // If the target is exactly at the center, just return center.
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = adx === 0 ? Number.POSITIVE_INFINITY : (w / 2) / adx;
  const sy = ady === 0 ? Number.POSITIVE_INFINITY : (h / 2) / ady;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function unitPerp(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, y: -1 };
  // Perpendicular (rotate 90 degrees).
  return { x: -dy / len, y: dx / len };
}

function offsetPolyline(points: Point[], perp: Point, offset: number): Point[] {
  if (offset === 0) return points;
  return points.map((p) => ({ x: p.x + perp.x * offset, y: p.y + perp.y * offset }));
}

type RelationshipVisual = {
  markerStart?: string;
  markerEnd?: string;
  dasharray?: string;
  showInfluenceLabel?: boolean;
};

function relationshipVisual(type: RelationshipType, isSelected: boolean): RelationshipVisual {
  const suffix = isSelected ? 'Sel' : '';

  switch (type) {
    case 'Association':
      return {};
    case 'Composition':
      return { markerStart: `url(#diamondFilled${suffix})` };
    case 'Aggregation':
      return { markerStart: `url(#diamondOpen${suffix})` };
    case 'Specialization':
      return { markerEnd: `url(#triangleOpen${suffix})` };
    case 'Realization':
      return { markerEnd: `url(#triangleOpen${suffix})`, dasharray: '6 5' };
    case 'Serving':
      return { markerEnd: `url(#arrowOpen${suffix})`, dasharray: '6 5' };
    case 'Flow':
      return { markerEnd: `url(#arrowOpen${suffix})`, dasharray: '6 5' };
    case 'Triggering':
      return { markerEnd: `url(#arrowOpen${suffix})` };
    case 'Assignment':
      return { markerEnd: `url(#arrowFilled${suffix})` };
    case 'Access':
      return { markerEnd: `url(#arrowOpen${suffix})` };
    case 'Influence':
      return { markerEnd: `url(#arrowOpen${suffix})`, dasharray: '2 4', showInfluenceLabel: true };
    default:
      return { markerEnd: `url(#arrowOpen${suffix})` };
  }
}

function polylineMidPoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= half && seg > 1e-6) {
      const t = (half - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += seg;
  }
  return points[Math.max(0, points.length - 1)];
}

export function DiagramCanvas({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const views = useMemo(() => (model ? sortViews(model.views) : []), [model]);

  useEffect(() => {
    if (!model) {
      setActiveViewId(null);
      return;
    }
    if (selection.kind === 'view') {
      setActiveViewId(selection.viewId);
      return;
    }
    if (selection.kind === 'viewNode') {
      setActiveViewId(selection.viewId);
      return;
    }
    if (activeViewId && model.views[activeViewId]) return;
    setActiveViewId(views[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, selection.kind === 'view' ? selection.viewId : selection.kind === 'viewNode' ? selection.viewId : null, views.length]);

  const activeView = model && activeViewId ? model.views[activeViewId] : null;

  const canExportImage = Boolean(model && activeViewId && activeView);

  function handleExportImage() {
    if (!model || !activeViewId) return;
    const svg = createViewSvg(model, activeViewId);
    const base = `${model.metadata.name}-${activeView?.name || 'view'}`;
    const fileName = sanitizeFileNameWithExtension(base, 'svg');
    downloadTextFile(fileName, svg, 'image/svg+xml');
  }

  // Zoom & fit
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  const clientToModelPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      // Prefer converting relative to the scaled diagram surface.
      // This avoids vertical offsets caused by sticky overlays inside the scroll viewport.
      const surface = surfaceRef.current;
      if (surface) {
        const rect = surface.getBoundingClientRect();
        return {
          x: (clientX - rect.left) / zoom,
          y: (clientY - rect.top) / zoom,
        };
      }

      // Fallback (should rarely be needed): convert relative to the scroll viewport.
      const vp = viewportRef.current;
      if (!vp) return null;
      const rect = vp.getBoundingClientRect();
      return {
        x: (vp.scrollLeft + (clientX - rect.left)) / zoom,
        y: (vp.scrollTop + (clientY - rect.top)) / zoom,
      };
    },
    [zoom]
  );

  // Relationship "wire" creation (drag from a node handle to another node).
  const [linkDrag, setLinkDrag] = useState<
    | {
        viewId: string;
        sourceElementId: string;
        sourcePoint: Point;
        currentPoint: Point;
        targetElementId: string | null;
      }
    | null
  >(null);

  const [pendingCreateRel, setPendingCreateRel] = useState<
    | {
        viewId: string;
        sourceElementId: string;
        targetElementId: string;
      }
    | null
  >(null);

  const [lastRelType, setLastRelType] = useState<RelationshipType>('Association');
  const [pendingRelType, setPendingRelType] = useState<RelationshipType>('Association');
  const [pendingRelError, setPendingRelError] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);

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

  const nodes: ViewNodeLayout[] = useMemo(
  () =>
    (activeView?.layout?.nodes ?? []).map((n, idx) => ({
      ...n,
      width: n.width ?? 120,
      height: n.height ?? 60,
      zIndex: typeof n.zIndex === 'number' ? n.zIndex : idx,
    })),
  [activeView]
);

  const bounds = useMemo(() => boundsForNodes(nodes), [nodes]);

  const surfacePadding = 120;
  const surfaceWidthModel = Math.max(800, bounds.maxX + surfacePadding);
  const surfaceHeightModel = Math.max(420, bounds.maxY + surfacePadding);

  function setZoomKeepingCenter(nextZoom: number) {
    const vp = viewportRef.current;
    if (!vp) {
      setZoom(nextZoom);
      return;
    }
    const cx = (vp.scrollLeft + vp.clientWidth / 2) / zoom;
    const cy = (vp.scrollTop + vp.clientHeight / 2) / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, cx * nextZoom - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, cy * nextZoom - vp.clientHeight / 2);
    });
  }

  function zoomIn() {
    setZoomKeepingCenter(clamp(Math.round((zoom + 0.1) * 10) / 10, 0.2, 3));
  }
  function zoomOut() {
    setZoomKeepingCenter(clamp(Math.round((zoom - 0.1) * 10) / 10, 0.2, 3));
  }
  function zoomReset() {
    setZoomKeepingCenter(1);
  }

  function fitToView() {
    const vp = viewportRef.current;
    if (!vp) return;
    if (!activeView || nodes.length === 0) return;

    const bw = bounds.maxX - bounds.minX + surfacePadding;
    const bh = bounds.maxY - bounds.minY + surfacePadding;

    const target = clamp(Math.min(vp.clientWidth / bw, vp.clientHeight / bh), 0.2, 3);
    setZoom(target);

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, cx * target - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, cy * target - vp.clientHeight / 2);
    });
  }

  // When switching views, reset zoom and center on content (no auto-fit).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !activeView) return;
    setZoom(1);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, cx - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, cy - vp.clientHeight / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewId]);

  // Basic drag handling (in model coordinates; convert pointer delta by zoom)
  const dragRef = useRef<{
    viewId: string;
    elementId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;

      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;

      const view = modelStore.getState().model?.views[d.viewId];
      const snap = Boolean(view?.formatting?.snapToGrid);
      const grid = view?.formatting?.gridSize ?? 20;

      let x = d.origX + dx;
      let y = d.origY + dy;
      if (snap && grid > 1) {
        x = Math.round(x / grid) * grid;
        y = Math.round(y / grid) * grid;
      }

      modelStore.updateViewNodePosition(d.viewId, d.elementId, x, y);
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [zoom]);

  // Relationship creation: drag a "wire" from a node handle to another node.
  useEffect(() => {
    if (!linkDrag) return;

    function onMove(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;
      // IMPORTANT: the relationship handle typically uses pointer capture.
      // That prevents pointerenter/leave from firing on other nodes, so we hit-test
      // in model coordinates to detect the current drop target.
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const targetId = hitTestNodeId(nodes, p, prev.sourceElementId);
        return { ...prev, currentPoint: p, targetElementId: targetId };
      });
    }

    function onUp(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const target = p ? hitTestNodeId(nodes, p, prev.sourceElementId) : prev.targetElementId;
        if (target && target !== prev.sourceElementId) {
          setPendingCreateRel({ viewId: prev.viewId, sourceElementId: prev.sourceElementId, targetElementId: target });
          setPendingRelType(lastRelType);
          setPendingRelError(null);
        }
        return null;
      });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [linkDrag, clientToModelPoint, lastRelType, nodes]);

  // Relationships to render: explicit in view if present, otherwise infer from model relationships between nodes in view.
  const relationshipIdsToRender = useMemo(() => {
    if (!model || !activeView) return [] as string[];
    const explicit = activeView.layout?.relationships ?? [];
    if (explicit.length > 0) return explicit.map((r) => r.relationshipId);
    const nodeSet = new Set(nodes.map((n) => n.elementId));
    return Object.values(model.relationships)
      .filter((r) => nodeSet.has(r.sourceElementId) && nodeSet.has(r.targetElementId))
      .map((r) => r.id);
  }, [model, activeView, nodes]);

  const relLayoutById = useMemo(() => {
    const m = new Map<string, ViewRelationshipLayout>();
    for (const r of activeView?.layout?.relationships ?? []) m.set(r.relationshipId, r);
    return m;
  }, [activeView]);

  type RelRenderItem = {
    relId: string;
    source: ViewNodeLayout;
    target: ViewNodeLayout;
    indexInGroup: number;
    totalInGroup: number;
    groupKey: string;
  };

  const relRenderItems: RelRenderItem[] = useMemo(() => {
    if (!model || !activeView) return [];
    // Group relationships by unordered (A,B) element pair so parallel lines are drawn
    // when multiple relationships exist between the same two elements.
    const groups = new Map<string, string[]>();
    for (const relId of relationshipIdsToRender) {
      const rel = model.relationships[relId];
      if (!rel) continue;
      const a = rel.sourceElementId;
      const b = rel.targetElementId;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const list = groups.get(key) ?? [];
      list.push(relId);
      groups.set(key, list);
    }

    const byElementId = new Map(nodes.map((n) => [n.elementId, n] as const));

    const items: RelRenderItem[] = [];
    for (const [groupKey, relIds] of groups.entries()) {
      // Keep stable order within group: by relationship id (consistent across renders)
      const stable = [...relIds].sort((x, y) => x.localeCompare(y));
      for (let i = 0; i < stable.length; i += 1) {
        const relId = stable[i];
        const rel = model.relationships[relId];
        if (!rel) continue;
        const s = byElementId.get(rel.sourceElementId);
        const t = byElementId.get(rel.targetElementId);
        if (!s || !t) continue;
        items.push({ relId, source: s, target: t, indexInGroup: i, totalInGroup: stable.length, groupKey });
      }
    }
    return items;
  }, [model, activeView, nodes, relationshipIdsToRender]);

  const pendingRelTypeOptions = useMemo(() => {
    if (!model || !pendingCreateRel) return RELATIONSHIP_TYPES;
    const view = model.views[pendingCreateRel.viewId];
    const vp = view ? getViewpointById(view.viewpointId) : undefined;
    return vp?.allowedRelationshipTypes?.length ? vp.allowedRelationshipTypes : RELATIONSHIP_TYPES;
  }, [model, pendingCreateRel]);

  // When the dialog opens, default the type to last used (if allowed), otherwise first option.
  useEffect(() => {
    if (!pendingCreateRel) return;
    const opts = pendingRelTypeOptions;
    const next = opts.includes(lastRelType) ? lastRelType : opts[0] ?? 'Association';
    setPendingRelType(next);
    setPendingRelError(null);
  }, [pendingCreateRel, pendingRelTypeOptions, lastRelType]);

  function closePendingRelationshipDialog() {
    setPendingCreateRel(null);
    setPendingRelError(null);
  }

  function confirmCreatePendingRelationship() {
    if (!model || !pendingCreateRel) return;
    setPendingRelError(null);

    const { sourceElementId, targetElementId } = pendingCreateRel;
    if (!model.elements[sourceElementId] || !model.elements[targetElementId]) {
      setPendingRelError('Both source and target elements must exist.');
      return;
    }

    const validation = validateRelationship({
      id: 'tmp',
      type: pendingRelType,
      sourceElementId,
      targetElementId
    });
    if (!validation.ok) {
      setPendingRelError(validation.errors[0] ?? 'Invalid relationship');
      return;
    }

    const rel = createRelationship({
      sourceElementId,
      targetElementId,
      type: pendingRelType
    });
    modelStore.addRelationship(rel);
    setLastRelType(pendingRelType);
    setPendingCreateRel(null);
    onSelect({ kind: 'relationship', relationshipId: rel.id });
  }

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
                style={{
                  width: surfaceWidthModel,
                  height: surfaceHeightModel,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <svg
                  className="diagramRelationships"
                  width={surfaceWidthModel}
                  height={surfaceHeightModel}
                  aria-label="Diagram relationships"
                >
                  <defs>
                    {/* Open arrow (dependency/triggering/flow/serving/access/influence) */}
                    <marker id="arrowOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                      <path
                        d="M 0 0 L 10 5 L 0 10"
                        fill="none"
                        stroke="var(--diagram-rel-stroke)"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </marker>
                    <marker id="arrowOpenSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                      <path
                        d="M 0 0 L 10 5 L 0 10"
                        fill="none"
                        stroke="var(--diagram-rel-stroke-selected)"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </marker>

                    {/* Filled arrow (assignment) */}
                    <marker id="arrowFilled" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--diagram-rel-stroke)" />
                    </marker>
                    <marker id="arrowFilledSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--diagram-rel-stroke-selected)" />
                    </marker>

                    {/* Open triangle (realization/specialization) */}
                    <marker id="triangleOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                      <path
                        d="M 0 0 L 10 5 L 0 10 z"
                        fill="none"
                        stroke="var(--diagram-rel-stroke)"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </marker>
                    <marker id="triangleOpenSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                      <path
                        d="M 0 0 L 10 5 L 0 10 z"
                        fill="none"
                        stroke="var(--diagram-rel-stroke-selected)"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </marker>

                    {/* Diamonds (composition/aggregation) at the source side */}
                    <marker id="diamondOpen" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                      <path
                        d="M 0 5 L 5 0 L 10 5 L 5 10 z"
                        fill="none"
                        stroke="var(--diagram-rel-stroke)"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </marker>
                    <marker id="diamondOpenSel" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                      <path
                        d="M 0 5 L 5 0 L 10 5 L 5 10 z"
                        fill="none"
                        stroke="var(--diagram-rel-stroke-selected)"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </marker>

                    <marker id="diamondFilled" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                      <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--diagram-rel-stroke)" />
                    </marker>
                    <marker id="diamondFilledSel" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                      <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--diagram-rel-stroke-selected)" />
                    </marker>
                  </defs>

                  {relRenderItems.map((item) => {
                    const relId = item.relId;
                    const rel = model.relationships[relId];
                    if (!rel) return null;

                    const s = item.source;
                    const t = item.target;

                    const sc: Point = { x: s.x + (s.width ?? 120) / 2, y: s.y + (s.height ?? 60) / 2 };
                    const tc: Point = { x: t.x + (t.width ?? 120) / 2, y: t.y + (t.height ?? 60) / 2 };

                    // Prefer border anchors (looks nicer than center-to-center).
                    const start = rectEdgeAnchor(s, tc);
                    const end = rectEdgeAnchor(t, sc);

                    const layout = relLayoutById.get(relId);
                    const midPts = layout?.points ?? [];
                    let points: Point[] = [start, ...midPts, end];

                    // If there are multiple relationships between the same two elements, offset them in parallel.
                    const total = item.totalInGroup;
                    if (total > 1) {
                      const spacing = 14;
                      const offsetIndex = item.indexInGroup - (total - 1) / 2;
                      const offset = offsetIndex * spacing;

                      // Use a stable perpendicular based on the unordered group key so
                      // relationships in opposite directions still spread apart consistently.
                      const parts = item.groupKey.split('|');
                      const aNode = nodes.find((n) => n.elementId === parts[0]);
                      const bNode = nodes.find((n) => n.elementId === parts[1]);
                      const aC: Point | null = aNode ? { x: aNode.x + (aNode.width ?? 120) / 2, y: aNode.y + (aNode.height ?? 60) / 2 } : null;
                      const bC: Point | null = bNode ? { x: bNode.x + (bNode.width ?? 120) / 2, y: bNode.y + (bNode.height ?? 60) / 2 } : null;
                      const perp = aC && bC ? unitPerp(aC, bC) : unitPerp(sc, tc);
                      points = offsetPolyline(points, perp, offset);
                    }

                    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                    const isSelected = selection.kind === 'relationship' && selection.relationshipId === relId;
                    const v = relationshipVisual(rel.type, isSelected);
                    const mid = v.showInfluenceLabel ? polylineMidPoint(points) : null;

                    return (
                      <g key={relId}>
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
                            onSelect({ kind: 'relationship', relationshipId: relId });
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
                            ±
                          </text>
                        ) : null}
                      </g>
                    );
                  })}


                  {/* Link creation preview */}
                  {linkDrag ? (() => {
                    const start = linkDrag.sourcePoint;
                    let end = linkDrag.currentPoint;
                    if (linkDrag.targetElementId) {
                      const t = nodes.find((n) => n.elementId === linkDrag.targetElementId);
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
                  })() : null}
                </svg>


                {nodes.map((n) => {
                  const el = model.elements[n.elementId];
                  if (!el) return null;

                  const isRelTarget = Boolean(linkDrag && linkDrag.targetElementId === n.elementId && linkDrag.sourceElementId !== n.elementId);
                  const isRelSource = Boolean(linkDrag && linkDrag.sourceElementId === n.elementId);

                  return (
                    <div
                      key={n.elementId}
                      className={
                        'diagramNode' +
                        (selection.kind === 'viewNode' && selection.viewId === activeView.id && selection.elementId === n.elementId ? ' isSelected' : '') +
                        (n.highlighted ? ' isHighlighted' : '') +
                        (isRelTarget ? ' isRelTarget' : '') +
                        (isRelSource ? ' isRelSource' : '')
                      }
                      style={{ left: n.x, top: n.y, width: n.width ?? 120, height: n.height ?? 60, zIndex: (n.zIndex ?? 0) as any, '--diagram-node-bg': LAYER_BG_VAR[ELEMENT_TYPE_TO_LAYER[el.type] ?? 'Business'] } as React.CSSProperties}
                      role="button"
                      tabIndex={0}
                      aria-label={`Diagram node ${el.name || '(unnamed)'}`}
                      onClick={() => {
                        if (linkDrag) return;
                        onSelect({ kind: 'viewNode', viewId: activeView.id, elementId: el.id });
                      }}
                      onPointerDown={(e) => {
                        if (linkDrag) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dragRef.current = { viewId: activeView.id, elementId: el.id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y };
                      }}
                      onPointerEnter={() => {
                        if (!linkDrag) return;
                        if (n.elementId === linkDrag.sourceElementId) return;
                        setLinkDrag((prev) => (prev ? { ...prev, targetElementId: n.elementId } : prev));
                      }}
                      onPointerLeave={() => {
                        if (!linkDrag) return;
                        setLinkDrag((prev) => (prev && prev.targetElementId === n.elementId ? { ...prev, targetElementId: null } : prev));
                      }}
                    >
                      {/* Node content (label offsets apply here, not to the handle) */}
                      <div className="diagramNodeContent" style={n.label ? { transform: `translate(${n.label.dx}px, ${n.label.dy}px)` } : undefined}>
                      <div className="diagramNodeHeader">
                        <div className="diagramNodeSymbol" aria-hidden="true">
                          <ArchimateSymbol type={el.type} />
                        </div>
                        <div className="diagramNodeTitle">{el.name || '(unnamed)'}</div>
                      </div>
                      <div className="diagramNodeMeta">{el.type}</div>
                      {n.styleTag ? <div className="diagramNodeTag">{n.styleTag}</div> : null}
                      </div>

                      {/* Outgoing relationship handle */}
                      <button
                        type="button"
                        className="diagramRelHandle"
                        aria-label={`Create relationship from ${el.name || '(unnamed)'}`}
                        title="Drag to another element to create a relationship"
                        onPointerDown={(e) => {
                          if (!activeView) return;
                          e.preventDefault();
                          e.stopPropagation();
                          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);

                          // Start the drag from the bottom-right corner (matches the handle position)
                          const sourcePoint: Point = { x: n.x + n.width, y: n.y + n.height };
                          const p = clientToModelPoint(e.clientX, e.clientY) ?? sourcePoint;
                          setLinkDrag({
                            viewId: activeView.id,
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
                })}
              </div>
            </div>
          </div>
        )}
      </div>

	      {/* Relationship type picker ("stereotype") shown after drag-drop */}
	      <Dialog
	        title="Create relationship"
	        isOpen={Boolean(pendingCreateRel)}
	        onClose={closePendingRelationshipDialog}
	        footer={
	          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
	            <button type="button" className="shellButton" onClick={closePendingRelationshipDialog}>
	              Cancel
	            </button>
	            <button type="button" className="shellButton" onClick={confirmCreatePendingRelationship}>
	              Create
	            </button>
	          </div>
	        }
	      >
	        {pendingCreateRel && model ? (
	          <div>
	            <div style={{ opacity: 0.9, marginBottom: 10 }}>
	              <div>
	                <b>From:</b> {model.elements[pendingCreateRel.sourceElementId]?.name ?? '—'}
	              </div>
	              <div>
	                <b>To:</b> {model.elements[pendingCreateRel.targetElementId]?.name ?? '—'}
	              </div>
	            </div>

	            <label htmlFor="diagram-rel-type" style={{ display: 'block', marginBottom: 6 }}>
	              Stereotype (relationship type)
	            </label>
	            <select id="diagram-rel-type" className="selectInput" value={pendingRelType} onChange={(e) => setPendingRelType(e.target.value as RelationshipType)}>
	              {pendingRelTypeOptions.map((rt) => (
	                <option key={rt} value={rt}>
	                  {rt}
	                </option>
	              ))}
	            </select>

	            {pendingRelError ? (
	              <div className="errorText" role="alert" style={{ marginTop: 10 }}>
	                {pendingRelError}
	              </div>
	            ) : null}
	          </div>
	        ) : null}
	      </Dialog>
    </div>
  );
}
