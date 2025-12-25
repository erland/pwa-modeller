import { useEffect, useMemo, useRef, useState } from 'react';
import type { View, ViewNodeLayout, ViewRelationshipLayout } from '../../domain';
import { downloadTextFile, modelStore, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';
import { createViewSvg } from './exportSvg';

type Props = {
  selection: Selection;
  onSelect: (sel: Selection) => void;
};

function sortViews(views: Record<string, View>): View[] {
  return Object.values(views).sort((a, b) => a.name.localeCompare(b.name));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

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

  const elements = useMemo(() => {
    if (!model) return [] as { id: string; label: string }[];
    return Object.values(model.elements)
      .map((e) => ({ id: e.id, label: `${e.name || '(unnamed)'} (${e.type})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [model]);

  const [elementToAdd, setElementToAdd] = useState<string>('');
  useEffect(() => {
    if (!elementToAdd && elements.length > 0) setElementToAdd(elements[0].id);
  }, [elementToAdd, elements]);

  const canAdd = Boolean(model && activeViewId && elementToAdd);
  const canExportImage = Boolean(model && activeViewId && activeView);

  function handleAdd() {
    if (!model || !activeViewId || !elementToAdd) return;
    modelStore.addElementToView(activeViewId, elementToAdd);
  }

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
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="fieldLabel" htmlFor="active-view">
            Current view
          </label>
          <select
            id="active-view"
            aria-label="Current view"
            className="selectInput"
            value={activeViewId ?? ''}
            onChange={(e) => setActiveViewId(e.currentTarget.value)}
            disabled={views.length === 0}
          >
            {views.length === 0 ? (
              <option value="">(no views)</option>
            ) : (
              views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="fieldLabel" htmlFor="element-to-add">
            Add element
          </label>
          <select
            id="element-to-add"
            aria-label="Element to add"
            className="selectInput"
            value={elementToAdd}
            onChange={(e) => setElementToAdd(e.currentTarget.value)}
            disabled={elements.length === 0 || views.length === 0}
          >
            {elements.length === 0 ? (
              <option value="">(no elements)</option>
            ) : (
              elements.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.label}
                </option>
              ))
            )}
          </select>
        </div>

        <button className="shellButton" type="button" onClick={handleAdd} disabled={!canAdd}>
          Add to view
        </button>

        <button className="shellButton" type="button" onClick={handleExportImage} disabled={!canExportImage}>
          Export as Image
        </button>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="shellButton" type="button" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
          <div style={{ minWidth: 64, textAlign: 'center', opacity: 0.9 }} aria-label="Zoom level">
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
        </div>
      </div>

      <div className="diagramCanvas">
        {views.length === 0 ? (
          <div className="diagramEmpty">Create a view from the left tree (Views ▸ Create…) to start placing elements.</div>
        ) : !activeView ? (
          <div className="diagramEmpty">Select a view to start diagramming.</div>
        ) : (
          <div className="diagramViewport" ref={viewportRef} aria-label="Diagram canvas">
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

                    return <path key={relId} d={d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={2} markerEnd="url(#arrow)" />;
                  })}
                </svg>

                {nodes.map((n) => {
                  const el = model.elements[n.elementId];
                  if (!el) return null;
                  return (
                    <div
                      key={n.elementId}
                      className={
                        'diagramNode' +
                        (selection.kind === 'viewNode' && selection.viewId === activeView.id && selection.elementId === n.elementId ? ' isSelected' : '') +
                        (n.highlighted ? ' isHighlighted' : '')
                      }
                      style={{ left: n.x, top: n.y, width: n.width ?? 120, height: n.height ?? 60 }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Diagram node ${el.name || '(unnamed)'}`}
                      onClick={() => onSelect({ kind: 'viewNode', viewId: activeView.id, elementId: el.id })}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dragRef.current = { viewId: activeView.id, elementId: el.id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y };
                      }}
                    >
                      <div className="diagramNodeTitle">{el.name || '(unnamed)'}</div>
                      <div className="diagramNodeMeta">{el.type}</div>
                      {n.styleTag ? <div className="diagramNodeTag">{n.styleTag}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
