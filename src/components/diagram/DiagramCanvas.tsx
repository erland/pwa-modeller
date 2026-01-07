import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RelationshipType, View, ViewNodeLayout, ViewRelationshipLayout, ArchimateLayer, ElementType } from '../../domain';
import { RELATIONSHIP_TYPES, createRelationship, createConnector, getDefaultViewObjectSize, getViewpointById, validateRelationship, ELEMENT_TYPES_BY_LAYER, createViewObject, createViewObjectNodeLayout } from '../../domain';
import { downloadTextFile, modelStore, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';
import { Dialog } from '../dialog/Dialog';
import { createViewSvg } from './exportSvg';
import type { Point } from './geometry';
import { boundsForNodes, clamp, hitTestConnectable, nodeRefFromLayout, offsetPolyline, polylineMidPoint, rectEdgeAnchor, unitPerp } from './geometry';
import { dataTransferHasElement, readDraggedElementId } from './dragDrop';
import { relationshipVisual } from './relationshipVisual';
import { RelationshipMarkers } from './RelationshipMarkers';
import { DiagramNode, type DiagramLinkDrag, type DiagramNodeDragState } from './DiagramNode';
import { DiagramConnectorNode } from './DiagramConnectorNode';
import { DiagramViewObjectNode } from './DiagramViewObjectNode';
import type { ConnectableRef } from './connectable';
import { refKey, sameRef } from './connectable';

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
  ImplementationMigration: 'var(--arch-layer-implementation)'
};


type ToolMode = 'select' | 'addNote' | 'addLabel' | 'addGroupBox';

type GroupBoxDraft = {
  start: Point;
  current: Point;
};



function sortViews(views: Record<string, View>): View[] {
  return Object.values(views).sort((a, b) => a.name.localeCompare(b.name));
}


export function DiagramCanvas({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [groupBoxDraft, setGroupBoxDraft] = useState<GroupBoxDraft | null>(null);
  const groupBoxDraftRef = useRef<GroupBoxDraft | null>(null);

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
    if (selection.kind === 'viewObject') {
      setActiveViewId(selection.viewId);
      return;
    }
    if (activeViewId && model.views[activeViewId]) return;
    setActiveViewId(views[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    model,
    selection.kind === 'view'
      ? selection.viewId
      : selection.kind === 'viewNode'
        ? selection.viewId
        : selection.kind === 'viewObject'
          ? selection.viewId
          : null,
    views.length,
  ]);

  // Tool mode: Escape cancels placement / returns to select.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setGroupBoxDraft(null);
        setToolMode('select');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeView = model && activeViewId ? model.views[activeViewId] : null;

  const canExportImage = Boolean(model && activeViewId && activeView);

  function handleExportImage() {
    if (!model || !activeViewId) return;
    const svg = createViewSvg(model, activeViewId);
    const base = `${model.metadata.name}-${activeView?.name || 'view'}`;
    const fileName = sanitizeFileNameWithExtension(base, 'svg');
    downloadTextFile(fileName, svg, 'image/svg+xml');
  }

  const beginGroupBoxDraft = useCallback(
    (start: Point) => {
      if (!activeViewId) return;
      const initial: GroupBoxDraft = { start, current: start };
      groupBoxDraftRef.current = initial;
      setGroupBoxDraft(initial);

      function onMove(e: PointerEvent) {
        const p = clientToModelPoint(e.clientX, e.clientY);
        if (!p) return;
        const next = { start, current: p };
        groupBoxDraftRef.current = next;
        setGroupBoxDraft(next);
      }

      function onUp(e: PointerEvent) {
        const end = clientToModelPoint(e.clientX, e.clientY);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);

        const draft = groupBoxDraftRef.current;
        groupBoxDraftRef.current = null;
        setGroupBoxDraft(null);

        if (!draft || !activeViewId) return;

        const p1 = draft.start;
        const p2 = end ?? draft.current;

        const x0 = Math.min(p1.x, p2.x);
        const y0 = Math.min(p1.y, p2.y);
        const w0 = Math.abs(p1.x - p2.x);
        const h0 = Math.abs(p1.y - p2.y);

        const minSize = 10;
        const useDefault = w0 < minSize && h0 < minSize;
        const size = useDefault
          ? getDefaultViewObjectSize('GroupBox')
          : { width: Math.max(minSize, w0), height: Math.max(minSize, h0) };

        const obj = createViewObject({ type: 'GroupBox' });
        const node = { ...createViewObjectNodeLayout(obj.id, x0, y0, size.width, size.height), zIndex: -100 };
        modelStore.addViewObject(activeViewId, obj, node);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: obj.id });
        setToolMode('select');
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [activeViewId, onSelect]
  );

  const onSurfacePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!model || !activeViewId || !activeView) return;
      if (toolMode === 'select') return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('.diagramNode, .diagramConnectorNode, .diagramViewObjectNode')) {
        return;
      }

      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;

      e.preventDefault();
      e.stopPropagation();

      if (toolMode === 'addNote') {
        const id = modelStore.createViewObjectInViewAt(activeViewId, 'Note', p.x, p.y);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: id });
        setToolMode('select');
      } else if (toolMode === 'addLabel') {
        const id = modelStore.createViewObjectInViewAt(activeViewId, 'Label', p.x, p.y);
        onSelect({ kind: 'viewObject', viewId: activeViewId, objectId: id });
        setToolMode('select');
      } else if (toolMode === 'addGroupBox') {
        beginGroupBoxDraft(p);
      }
    },
    [model, activeViewId, activeView, toolMode, beginGroupBoxDraft, onSelect]
  );

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
  const [linkDrag, setLinkDrag] = useState<DiagramLinkDrag | null>(null);

  const [pendingCreateRel, setPendingCreateRel] = useState<
    | {
        viewId: string;
        sourceRef: ConnectableRef;
        targetRef: ConnectableRef;
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
  const dragRef = useRef<DiagramNodeDragState | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;

      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;

      const view = modelStore.getState().model?.views[d.viewId];
      const snap = Boolean(view?.formatting?.snapToGrid);
      const grid = view?.formatting?.gridSize ?? 20;

      const ref =
        d.ref.kind === 'element'
          ? { elementId: d.ref.id }
          : d.ref.kind === 'connector'
            ? { connectorId: d.ref.id }
            : { objectId: d.ref.id };

      if (d.action === 'resize') {
        // MVP: bottom-right resize. Clamp to reasonable minimums.
        let minW = 40;
        let minH = 24;
        if (d.ref.kind === 'connector') {
          minW = 16;
          minH = 16;
        }
        if (d.ref.kind === 'object') {
          const obj = view?.objects?.[d.ref.id];
          if (obj?.type === 'GroupBox') {
            minW = 160;
            minH = 120;
          } else if (obj?.type === 'Note') {
            minW = 140;
            minH = 90;
          } else {
            // Label
            minW = 80;
            minH = 24;
          }
        }

        let w = Math.max(minW, d.origW + dx);
        let h = Math.max(minH, d.origH + dy);
        if (snap && grid > 1) {
          w = Math.round(w / grid) * grid;
          h = Math.round(h / grid) * grid;
        }

        modelStore.updateViewNodeLayoutAny(d.viewId, ref, { width: w, height: h });
        return;
      }

      let x = d.origX + dx;
      let y = d.origY + dy;
      if (snap && grid > 1) {
        x = Math.round(x / grid) * grid;
        y = Math.round(y / grid) * grid;
      }

      modelStore.updateViewNodePositionAny(d.viewId, ref, x, y);
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
        const targetRef = hitTestConnectable(nodes, p, prev.sourceRef);
        return { ...prev, currentPoint: p, targetRef };
      });
    }

    function onUp(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const target = p ? hitTestConnectable(nodes, p, prev.sourceRef) : prev.targetRef;
        if (target && !sameRef(target, prev.sourceRef)) {
          setPendingCreateRel({ viewId: prev.viewId, sourceRef: prev.sourceRef, targetRef: target });
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
    const nodeSet = new Set(
      nodes
        .map((n) => nodeRefFromLayout(n))
        .filter((r): r is ConnectableRef => Boolean(r))
        .map((r) => refKey(r))
    );

    function sourceRefForRel(r: any): ConnectableRef | null {
      if (typeof r.sourceElementId === 'string') return { kind: 'element', id: r.sourceElementId };
      if (typeof r.sourceConnectorId === 'string') return { kind: 'connector', id: r.sourceConnectorId };
      return null;
    }
    function targetRefForRel(r: any): ConnectableRef | null {
      if (typeof r.targetElementId === 'string') return { kind: 'element', id: r.targetElementId };
      if (typeof r.targetConnectorId === 'string') return { kind: 'connector', id: r.targetConnectorId };
      return null;
    }

    return Object.values(model.relationships)
      .filter((r) => {
        const s = sourceRefForRel(r);
        const t = targetRefForRel(r);
        return Boolean(s && t && nodeSet.has(refKey(s)) && nodeSet.has(refKey(t)));
      })
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
    // Group relationships by unordered (A,B) endpoint pair so parallel lines are drawn
    // when multiple relationships exist between the same two nodes.
    const groups = new Map<string, string[]>();

    const nodeByKey = new Map<string, ViewNodeLayout>();
    for (const n of nodes) {
      const r = nodeRefFromLayout(n);
      if (r) nodeByKey.set(refKey(r), n);
    }

    const sourceRefForRel = (r: any): ConnectableRef | null => {
      if (typeof r.sourceElementId === 'string') return { kind: 'element', id: r.sourceElementId };
      if (typeof r.sourceConnectorId === 'string') return { kind: 'connector', id: r.sourceConnectorId };
      return null;
    };
    const targetRefForRel = (r: any): ConnectableRef | null => {
      if (typeof r.targetElementId === 'string') return { kind: 'element', id: r.targetElementId };
      if (typeof r.targetConnectorId === 'string') return { kind: 'connector', id: r.targetConnectorId };
      return null;
    };

    for (const relId of relationshipIdsToRender) {
      const rel = model.relationships[relId];
      if (!rel) continue;
      const s = sourceRefForRel(rel);
      const t = targetRefForRel(rel);
      if (!s || !t) continue;
      const a = refKey(s);
      const b = refKey(t);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const list = groups.get(key) ?? [];
      list.push(relId);
      groups.set(key, list);
    }

    const items: RelRenderItem[] = [];
    for (const [groupKey, relIds] of groups.entries()) {
      const stable = [...relIds].sort((x, y) => x.localeCompare(y));
      for (let i = 0; i < stable.length; i += 1) {
        const relId = stable[i];
        const rel = model.relationships[relId];
        if (!rel) continue;
        const sRef = sourceRefForRel(rel);
        const tRef = targetRefForRel(rel);
        if (!sRef || !tRef) continue;
        const s = nodeByKey.get(refKey(sRef));
        const t = nodeByKey.get(refKey(tRef));
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

    const { sourceRef, targetRef } = pendingCreateRel;

    const sourceOk = sourceRef.kind === 'element' ? Boolean(model.elements[sourceRef.id]) : Boolean(model.connectors?.[sourceRef.id]);
    const targetOk = targetRef.kind === 'element' ? Boolean(model.elements[targetRef.id]) : Boolean(model.connectors?.[targetRef.id]);
    if (!sourceOk || !targetOk) {
      setPendingRelError('Both source and target endpoints must exist.');
      return;
    }

    // Only apply ArchiMate relationship rule validation when both endpoints are elements.
    if (sourceRef.kind === 'element' && targetRef.kind === 'element') {
      const validation = validateRelationship({
        id: 'tmp',
        type: pendingRelType,
        sourceElementId: sourceRef.id,
        targetElementId: targetRef.id,
      });
      if (!validation.ok) {
        setPendingRelError(validation.errors[0] ?? 'Invalid relationship');
        return;
      }
    }

    const rel = createRelationship({
      type: pendingRelType,
      sourceElementId: sourceRef.kind === 'element' ? sourceRef.id : undefined,
      sourceConnectorId: sourceRef.kind === 'connector' ? sourceRef.id : undefined,
      targetElementId: targetRef.kind === 'element' ? targetRef.id : undefined,
      targetConnectorId: targetRef.kind === 'connector' ? targetRef.id : undefined,
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
                onPointerDownCapture={onSurfacePointerDownCapture}
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
                            {v.midLabel}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}


                  {/* Link creation preview */}
                  {linkDrag ? (() => {
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
                  })() : null}
                </svg>


                {nodes.map((n) => {
                  if (n.elementId) {
                    const el = model.elements[n.elementId];
                    if (!el) return null;

                    const layer = ELEMENT_TYPE_TO_LAYER[el.type] ?? 'Business';
                    const bgVar = LAYER_BG_VAR[layer];

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
                        onBeginNodeDrag={(state) => {
                          dragRef.current = state;
                        }}
                        onHoverAsRelationshipTarget={(ref) => {
                          setLinkDrag((prev) => (prev ? { ...prev, targetRef: ref } : prev));
                        }}
                        clientToModelPoint={clientToModelPoint}
                        onStartLinkDrag={(drag) => {
                          setLinkDrag(drag);
                        }}
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
                        onBeginNodeDrag={(state) => {
                          dragRef.current = state;
                        }}
                        onHoverAsRelationshipTarget={(ref) => {
                          setLinkDrag((prev) => (prev ? { ...prev, targetRef: ref } : prev));
                        }}
                        clientToModelPoint={clientToModelPoint}
                        onStartLinkDrag={(drag) => {
                          setLinkDrag(drag);
                        }}
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
                        onBeginNodeDrag={(state) => {
                          dragRef.current = state;
                        }}
                      />
                    );
                  }

                  return null;
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
	                <b>From:</b>{' '}
	                {pendingCreateRel.sourceRef.kind === 'element'
	                  ? (model.elements[pendingCreateRel.sourceRef.id]?.name ?? '—')
	                  : (model.connectors?.[pendingCreateRel.sourceRef.id]?.type ?? 'Connector')}
	              </div>
	              <div>
	                <b>To:</b>{' '}
	                {pendingCreateRel.targetRef.kind === 'element'
	                  ? (model.elements[pendingCreateRel.targetRef.id]?.name ?? '—')
	                  : (model.connectors?.[pendingCreateRel.targetRef.id]?.type ?? 'Connector')}
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