import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RelationshipType, View, ViewNodeLayout, ViewRelationshipLayout } from '../../domain';
import { RELATIONSHIP_TYPES, createRelationship, getViewpointById, validateRelationship } from '../../domain';
import { downloadTextFile, modelStore, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';
import { Dialog } from '../dialog/Dialog';
import { createViewSvg } from './exportSvg';

type Props = {
  selection: Selection;
  onSelect: (sel: Selection) => void;
};

// Drag payload for dragging an element from the tree into a view.
const DND_ELEMENT_MIME = 'application/x-pwa-modeller-element-id';

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
  const [zoom, setZoom] = useState<number>(1);

  const clientToModelPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
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
      (activeView?.layout?.nodes ?? []).map((n) => ({
        ...n,
        width: n.width ?? 120,
        height: n.height ?? 60,
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
                    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(0,0,0,0.55)" />
                    </marker>
                  </defs>

                  {relationshipIdsToRender.map((relId) => {
                    const rel = model.relationships[relId];
                    if (!rel) return null;

                    const s = nodes.find((n) => n.elementId === rel.sourceElementId);
                    const t = nodes.find((n) => n.elementId === rel.targetElementId);
                    if (!s || !t) return null;

                    const sx = s.x + s.width / 2;
                    const sy = s.y + s.height / 2;
                    const tx = t.x + t.width / 2;
                    const ty = t.y + t.height / 2;

                    const layout = relLayoutById.get(relId);
                    const pts = layout?.points ?? [];
                    const points = [{ x: sx, y: sy }, ...pts, { x: tx, y: ty }];
                    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                    const isSelected = selection.kind === 'relationship' && selection.relationshipId === relId;

                    return (
                      <g key={relId}>
                        {/*
                          Large invisible hit target so relationships are easy to select.
                          (The visible line itself has pointer-events disabled.)
                        */}
                        <path
                          className="diagramRelHit"
                          d={d}
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
                          markerEnd="url(#arrow)"
                        />
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
                        stroke="rgba(0,0,0,0.35)"
                        strokeWidth={2}
                        strokeDasharray="6 5"
                        markerEnd="url(#arrow)"
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
                      style={{ left: n.x, top: n.y, width: n.width ?? 120, height: n.height ?? 60 }}
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
                      <div className="diagramNodeTitle">{el.name || '(unnamed)'}</div>
                      <div className="diagramNodeMeta">{el.type}</div>
                      {n.styleTag ? <div className="diagramNodeTag">{n.styleTag}</div> : null}

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

                          const sourcePoint: Point = { x: n.x + n.width, y: n.y + n.height / 2 };
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
