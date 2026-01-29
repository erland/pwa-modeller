import { useCallback, useEffect, useMemo } from 'react';
import type { AlignMode, AutoLayoutOptions, DistributeMode, Model, SameSizeMode, View } from '../../domain';
import { createConnector } from '../../domain';
import { modelStore } from '../../store';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';

import { DiagramCanvasView, type RelationshipCreationController } from './DiagramCanvasView';

import { useActiveViewId } from './hooks/useActiveViewId';
import { useDiagramViewport } from './hooks/useDiagramViewport';
import { useDiagramToolState } from './hooks/useDiagramToolState';
import { useDiagramNodeDrag } from './hooks/useDiagramNodeDrag';
import { useDiagramRelationshipCreation } from './hooks/useDiagramRelationshipCreation';

import type { DiagramNodeDragState } from './DiagramNode';

import { useDiagramNodes } from './hooks/useDiagramNodes';
import { useDiagramExportImage } from './hooks/useDiagramExportImage';
import { useDiagramElementDrop } from './hooks/useDiagramElementDrop';
import { useDiagramConnections } from './hooks/useDiagramConnections';
import { useDiagramMarqueeSelection } from './hooks/useDiagramMarqueeSelection';
import { getNotation } from '../../notations';

type Props = {
  selection: Selection;
  onSelect: (sel: Selection) => void;
};

function sortViews(views: Record<string, View>): View[] {
  return Object.values(views).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Container/controller for the diagram canvas.
 *
 * Rendering is delegated to {@link DiagramCanvasView}; all non-trivial logic lives in hooks.
 */
export function DiagramCanvas({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model) as Model | null;

  const views = useMemo(() => (model ? sortViews(model.views) : []), [model]);
  const { activeViewId } = useActiveViewId(model, views, selection);
  const activeView = model && activeViewId ? model.views[activeViewId] : null;

  const { nodes, bounds, surfacePadding, surfaceWidthModel, surfaceHeightModel } = useDiagramNodes(activeView);

  const viewport = useDiagramViewport({
    activeViewId,
    activeView,
    bounds,
    hasNodes: nodes.length > 0,
    surfacePadding,
  });

  // When a selection jump targets a specific node in the active view, center the viewport on it.
  useEffect(() => {
    if (!activeViewId) return;
    if (selection.kind !== 'viewNode') return;
    if (selection.viewId !== activeViewId) return;
    const vp = viewport.viewportRef.current;
    if (!vp) return;
    const n = nodes.find((x) => x.elementId === selection.elementId);
    if (!n) return;

    const cx = (n.x + n.width / 2) * viewport.zoom;
    const cy = (n.y + n.height / 2) * viewport.zoom;
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, cx - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, cy - vp.clientHeight / 2);
    });
  }, [activeViewId, nodes, selection, viewport.viewportRef, viewport.zoom]);

  const tool = useDiagramToolState({
    model,
    activeViewId,
    activeView,
    clientToModelPoint: viewport.clientToModelPoint,
    onSelect,
  });

  const nodeDrag = useDiagramNodeDrag(viewport.zoom);

  // Multi-select drag: if the user drags a node that is part of the current multi-selection,
  // move the entire selection as a single gesture.
  const onBeginNodeDrag = useCallback(
    (state: DiagramNodeDragState) => {
      let next = state;

      if (
        state.action === 'move' &&
        state.ref.kind === 'element' &&
        selection.kind === 'viewNodes' &&
        selection.viewId === state.viewId
      ) {
        // Only batch-move when the dragged node is part of the selection.
        if (selection.elementIds.includes(state.ref.id)) {
          const batch = selection.elementIds
            .map((id) => {
              const n = nodes.find((x) => x.elementId === id);
              if (!n) return null;
              return {
                ref: { kind: 'element' as const, id },
                origX: n.x,
                origY: n.y,
                origW: n.width ?? 120,
                origH: n.height ?? 60,
                locked: Boolean(n.locked),
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

          if (batch.length > 1) {
            next = { ...state, batch };
          }
        }
      }

      nodeDrag.beginNodeDrag(next);
    },
    [nodeDrag, nodes, selection]
  );

  const rel = useDiagramRelationshipCreation({
    model,
    nodes,
    clientToModelPoint: viewport.clientToModelPoint,
    onSelect,
  });

  const { canExportImage, handleExportImage } = useDiagramExportImage({ model, activeViewId, activeView });

  const drop = useDiagramElementDrop({
    model,
    activeViewId,
    zoom: viewport.zoom,
    viewportRef: viewport.viewportRef,
    onSelect,
  });

  const { connectionRenderItems, connectionHitItems } = useDiagramConnections({ model, activeView, nodes });

  const surfaceSelection = useDiagramMarqueeSelection({
    toolMode: tool.toolMode,
    model,
    activeViewId,
    activeView,
    nodes,
    selection,
    linkDrag: rel.linkDrag,
    surfaceRef: viewport.surfaceRef,
    clientToModelPoint: viewport.clientToModelPoint,
    zoom: viewport.zoom,
    hitItems: connectionHitItems,
    onSurfacePointerDownCapture: tool.onSurfacePointerDownCapture,
    onSelect,
  });

  const notation = useMemo(() => getNotation(activeView?.kind ?? 'archimate'), [activeView?.kind]);
  const getElementBgVar = useCallback((t: string) => notation.getElementBgVar(t), [notation]);

  const onAddAndJunction = useCallback(() => {
    if (!model || !activeViewId) return;
    const conn = createConnector({ type: 'AndJunction' });
    modelStore.addConnector(conn);
    const vp = viewport.viewportRef.current;
    const cx = vp ? (vp.scrollLeft + vp.clientWidth / 2) / viewport.zoom : 100;
    const cy = vp ? (vp.scrollTop + vp.clientHeight / 2) / viewport.zoom : 100;
    modelStore.addConnectorToViewAt(activeViewId, conn.id, cx, cy);
  }, [activeViewId, model, viewport.viewportRef, viewport.zoom]);

  const onAddOrJunction = useCallback(() => {
    if (!model || !activeViewId) return;
    const conn = createConnector({ type: 'OrJunction' });
    modelStore.addConnector(conn);
    const vp = viewport.viewportRef.current;
    const cx = vp ? (vp.scrollLeft + vp.clientWidth / 2) / viewport.zoom : 100;
    const cy = vp ? (vp.scrollTop + vp.clientHeight / 2) / viewport.zoom : 100;
    modelStore.addConnectorToViewAt(activeViewId, conn.id, cx, cy);
  }, [activeViewId, model, viewport.viewportRef, viewport.zoom]);

  const onAutoLayout = useCallback(
    async (overrides: Partial<AutoLayoutOptions> = {}) => {
      if (!activeViewId || !activeView) return;
      try {
        const defaultsByKind: Record<string, AutoLayoutOptions> = {
          archimate: { scope: 'all', direction: 'RIGHT', spacing: 80, edgeRouting: 'POLYLINE', respectLocked: true },
          bpmn: { scope: 'all', direction: 'RIGHT', spacing: 100, edgeRouting: 'ORTHOGONAL', respectLocked: true },
          uml: { scope: 'all', direction: 'RIGHT', spacing: 110, edgeRouting: 'ORTHOGONAL', respectLocked: true },
        };

        // Defaults tuned per notation, but overridable via the dialog.
        const options: AutoLayoutOptions = {
          ...(defaultsByKind[activeView.kind] ?? defaultsByKind.archimate),
          ...overrides,
        };

        let selectionNodeIds: string[] | undefined;
        if (options.scope === 'selection' || options.lockSelection) {
          if (selection.kind === 'viewNode' && selection.viewId === activeViewId) {
            selectionNodeIds = [selection.elementId];
          } else if (selection.kind === 'viewNodes' && selection.viewId === activeViewId) {
            selectionNodeIds = selection.elementIds;
          }
        }

        await modelStore.autoLayoutView(activeViewId, options, selectionNodeIds);
      } catch (e) {
        // Avoid crashing the UI; errors can be inspected in dev tools.
        console.error('Auto layout failed', e);
      }
    },
    [activeViewId, activeView, selection]
  );

  const onAlignSelection = useCallback(
    (mode: AlignMode) => {
      if (!activeViewId || !activeView) return;
      if (selection.kind !== 'viewNodes') return;
      if (selection.viewId !== activeViewId) return;
      if (selection.elementIds.length < 2) return;

      try {
        modelStore.alignViewElements(activeViewId, selection.elementIds, mode);
      } catch (e) {
        console.error('Align failed', e);
      }
    },
    [activeViewId, activeView, selection]
  );

  const onDistributeSelection = useCallback(
    (mode: DistributeMode) => {
      if (!activeViewId || !activeView) return;
      if (selection.kind !== 'viewNodes') return;
      if (selection.viewId !== activeViewId) return;
      if (selection.elementIds.length < 3) return;

      try {
        modelStore.distributeViewElements(activeViewId, selection.elementIds, mode);
      } catch (e) {
        console.error('Distribute failed', e);
      }
    },
    [activeViewId, activeView, selection]
  );

  const onSameSizeSelection = useCallback(
    (mode: SameSizeMode) => {
      if (!activeViewId || !activeView) return;
      if (selection.kind !== 'viewNodes') return;
      if (selection.viewId !== activeViewId) return;
      if (selection.elementIds.length < 2) return;

      try {
        modelStore.sameSizeViewElements(activeViewId, selection.elementIds, mode);
      } catch (e) {
        console.error('Same size failed', e);
      }
    },
    [activeViewId, activeView, selection]
  );

  const onFitToTextSelection = useCallback(() => {
    if (!activeViewId || !activeView || activeView.kind !== 'archimate') return;

    let ids: string[] = [];
    if (selection.kind === 'viewNode' && selection.viewId === activeViewId) {
      ids = [selection.elementId];
    } else if (selection.kind === 'viewNodes' && selection.viewId === activeViewId) {
      ids = selection.elementIds;
    }
    if (ids.length === 0) return;

    try {
      modelStore.fitViewElementsToText(activeViewId, ids);
    } catch (e) {
      console.error('Fit to text failed', e);
    }
  }, [activeViewId, activeView, selection]);


  if (!model) {
    return (
      <div aria-label="Diagram canvas" className="diagramCanvas">
        <div className="diagramEmpty">Create or open a model to start diagramming.</div>
      </div>
    );
  }

  return (
    <DiagramCanvasView
      model={model}
      views={views}
      activeViewId={activeViewId}
      activeView={activeView}
      notation={notation}
      nodes={nodes}
      selection={selection}
      onSelect={onSelect}
      toolMode={tool.toolMode}
      setToolMode={tool.setToolMode}
      beginPlaceExistingElement={tool.beginPlaceExistingElement}
      findFolderContainingView={tool.findFolderContainingView}
      groupBoxDraft={tool.groupBoxDraft}
      viewportRef={viewport.viewportRef}
      surfaceRef={viewport.surfaceRef}
      zoom={viewport.zoom}
      zoomIn={viewport.zoomIn}
      zoomOut={viewport.zoomOut}
      zoomReset={viewport.zoomReset}
      fitToView={viewport.fitToView}
      surfaceWidthModel={surfaceWidthModel}
      surfaceHeightModel={surfaceHeightModel}
      onSurfacePointerDownCapture={surfaceSelection.handleSurfacePointerDownCapture}
      onSurfacePointerMove={surfaceSelection.handleSurfacePointerMove}
      onSurfacePointerUp={surfaceSelection.handleSurfacePointerUp}
      onSurfacePointerCancel={surfaceSelection.handleSurfacePointerCancel}
      marqueeRect={surfaceSelection.marqueeRect}
      isDragOver={drop.isDragOver}
      onViewportDragOver={drop.handleViewportDragOver}
      onViewportDragLeave={drop.handleViewportDragLeave}
      onViewportDrop={drop.handleViewportDrop}
      connectionRenderItems={connectionRenderItems}
      rel={rel as unknown as RelationshipCreationController}
      onBeginNodeDrag={onBeginNodeDrag}
      clientToModelPoint={viewport.clientToModelPoint}
      getElementBgVar={getElementBgVar}
      canExportImage={canExportImage}
      onExportImage={handleExportImage}
      onAutoLayout={onAutoLayout}
      onAlignSelection={onAlignSelection}
      onDistributeSelection={onDistributeSelection}
      onSameSizeSelection={onSameSizeSelection}
      onFitToTextSelection={onFitToTextSelection}
      onAddAndJunction={onAddAndJunction}
      onAddOrJunction={onAddOrJunction}
    />
  );
}
