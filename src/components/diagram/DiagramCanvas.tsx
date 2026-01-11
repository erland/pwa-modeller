import type * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ArchimateLayer, ElementType, Model, RelationshipType, View, ViewNodeLayout } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, createConnector, getDefaultViewObjectSize } from '../../domain';
import { downloadTextFile, modelStore, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';
import { Dialog } from '../dialog/Dialog';
import { createViewSvg } from './exportSvg';
import { boundsForNodes, nodeRefFromLayout } from './geometry';
import { dataTransferHasElement, readDraggedElementId } from './dragDrop';
import type { ConnectableRef } from './connectable';
import { refKey } from './connectable';

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
                onPointerDownCapture={onSurfacePointerDownCapture}
                style={{
                  width: surfaceWidthModel,
                  height: surfaceHeightModel,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <DiagramRelationshipsLayer
                  model={model}
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
