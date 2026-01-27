import type * as React from 'react';
import type { AlignMode, AutoLayoutOptions, DistributeMode, Model, RelationshipType, SameSizeMode, View, ViewNodeLayout } from '../../domain';
import { getRelationshipTypeLabel } from '../../domain';
import type { Notation } from '../../notations';
import { Dialog } from '../dialog/Dialog';

import type { Selection } from '../model/selection';
import type { Point } from './geometry';
import type { MarqueeRect } from './hooks/useDiagramMarqueeSelection';
import type { DiagramLinkDrag, DiagramNodeDragState } from './DiagramNode';
import type { ConnectableRef } from './connectable';

import type { GroupBoxDraft, ToolMode } from './hooks/useDiagramToolState';
import { DiagramToolbar } from './DiagramToolbar';
import { DiagramNodesLayer } from './layers/DiagramNodesLayer';
import type { ConnectionRenderItem } from './layers/DiagramRelationshipsLayer';
import { DiagramRelationshipsLayer } from './layers/DiagramRelationshipsLayer';

export type RelationshipCreationController = {
  linkDrag: DiagramLinkDrag | null;
  hoverAsRelationshipTarget: (ref: ConnectableRef | null) => void;
  startLinkDrag: (drag: DiagramLinkDrag) => void;

  pendingCreateRel: null | {
    viewId: string;
    sourceRef: { kind: 'element' | 'connector'; id: string };
    targetRef: { kind: 'element' | 'connector'; id: string };
  };
  pendingRelType: RelationshipType;
  setPendingRelType: (t: RelationshipType) => void;
  pendingRelError: string | null;
  pendingRelTypeOptions: RelationshipType[];
  showAllPendingRelTypes: boolean;
  setShowAllPendingRelTypes: (v: boolean) => void;

  closePendingRelationshipDialog: () => void;
  confirmCreatePendingRelationship: () => void;
};

export type DiagramCanvasViewProps = {
  model: Model;
  views: View[];
  activeViewId: string | null;
  activeView: View | null;
  notation: Notation;
  nodes: ViewNodeLayout[];

  selection: Selection;
  onSelect: (sel: Selection) => void;

  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  beginPlaceExistingElement: (elementId: string) => void;
  findFolderContainingView: (m: Model, viewId: string) => string | undefined;
  groupBoxDraft: GroupBoxDraft | null;

  viewportRef: React.RefObject<HTMLDivElement>;
  surfaceRef: React.RefObject<HTMLDivElement>;

  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  fitToView: () => void;

  surfaceWidthModel: number;
  surfaceHeightModel: number;
  onSurfacePointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSurfacePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSurfacePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSurfacePointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  marqueeRect: MarqueeRect | null;

  isDragOver: boolean;
  onViewportDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onViewportDragLeave: () => void;
  onViewportDrop: (e: React.DragEvent<HTMLDivElement>) => void;

  connectionRenderItems: ConnectionRenderItem[];

  rel: RelationshipCreationController;
  onBeginNodeDrag: (state: DiagramNodeDragState) => void;
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  getElementBgVar: (t: string) => string;

  canExportImage: boolean;
  onExportImage: () => void;
  onAutoLayout: (overrides?: Partial<AutoLayoutOptions>) => void;
  onAlignSelection: (mode: AlignMode) => void;
  onDistributeSelection: (mode: DistributeMode) => void;
  onSameSizeSelection: (mode: SameSizeMode) => void;
  onFitToTextSelection: () => void;
  onAddAndJunction: () => void;
  onAddOrJunction: () => void;
};

export function DiagramCanvasView({
  model,
  views,
  activeViewId,
  activeView,
  notation,
  nodes,
  selection,
  onSelect,
  toolMode,
  setToolMode,
  beginPlaceExistingElement,
  findFolderContainingView,
  groupBoxDraft,
  viewportRef,
  surfaceRef,
  zoom,
  zoomIn,
  zoomOut,
  zoomReset,
  fitToView,
  surfaceWidthModel,
  surfaceHeightModel,
  onSurfacePointerDownCapture,
  onSurfacePointerMove,
  onSurfacePointerUp,
  onSurfacePointerCancel,
  marqueeRect,
  isDragOver,
  onViewportDragOver,
  onViewportDragLeave,
  onViewportDrop,
  connectionRenderItems,
  rel,
  onBeginNodeDrag,
  clientToModelPoint,
  getElementBgVar,
  canExportImage,
  onExportImage,
  onAutoLayout,
  onAlignSelection,
  onDistributeSelection,
  onSameSizeSelection,
  onFitToTextSelection,
  onAddAndJunction,
  onAddOrJunction,
}: DiagramCanvasViewProps) {
  const createRelDisabled = Boolean(rel.pendingRelError) && !rel.showAllPendingRelTypes;

  return (
    <div className="diagramWrap">
      <DiagramToolbar
        model={model}
        activeViewId={activeViewId}
        activeView={activeView}
        selection={selection}
        nodesCount={nodes.length}
        toolMode={toolMode}
        setToolMode={setToolMode}
        zoom={zoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        zoomReset={zoomReset}
        fitToView={fitToView}
        canExportImage={canExportImage}
        onExportImage={onExportImage}
        onAutoLayout={onAutoLayout}
        onAlignSelection={onAlignSelection}
        onDistributeSelection={onDistributeSelection}
        onSameSizeSelection={onSameSizeSelection}
        onFitToTextSelection={onFitToTextSelection}
        onAddAndJunction={onAddAndJunction}
        onAddOrJunction={onAddOrJunction}
        beginPlaceExistingElement={beginPlaceExistingElement}
        findFolderContainingView={findFolderContainingView}
        onSelect={onSelect}
      />

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
            onDragOver={onViewportDragOver}
            onDragLeave={onViewportDragLeave}
            onDrop={onViewportDrop}
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
                onPointerMove={onSurfacePointerMove}
                onPointerUp={onSurfacePointerUp}
                onPointerCancel={onSurfacePointerCancel}
                style={{
                  width: surfaceWidthModel,
                  height: surfaceHeightModel,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                {marqueeRect ? (
                  <div
                    className="diagramMarquee"
                    style={{
                      position: 'absolute',
                      left: marqueeRect.x,
                      top: marqueeRect.y,
                      width: marqueeRect.width,
                      height: marqueeRect.height,
                    }}
                  />
                ) : null}
                <DiagramNodesLayer
                  model={model}
                  activeView={activeView}
                  notation={notation}
                  nodes={nodes}
                  selection={selection}
                  linkDrag={rel.linkDrag}
                  clientToModelPoint={clientToModelPoint}
                  onSelect={onSelect}
                  onBeginNodeDrag={onBeginNodeDrag}
                  onHoverAsRelationshipTarget={rel.hoverAsRelationshipTarget}
                  onStartLinkDrag={rel.startLinkDrag}
                  getElementBgVar={getElementBgVar}
                />

                {/*
                  Relationships are rendered as a dedicated overlay layer so they are always visible.
                  (Individual hit targets opt-in to pointer events; the empty SVG surface does not
                  block node interaction.)
                */}
                <DiagramRelationshipsLayer
                  model={model}
                  notation={notation}
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
            <button
              type="button"
              className="shellButton"
              onClick={rel.confirmCreatePendingRelationship}
              disabled={createRelDisabled}
              title={createRelDisabled ? (rel.pendingRelError ?? "Not allowed") : "Create relationship"}
            >
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
              Relationship type
            </label>
            <select
              id="diagram-rel-type"
              className="selectInput"
              value={rel.pendingRelType}
              onChange={(e) => rel.setPendingRelType(e.target.value as RelationshipType)}
            >
              {rel.pendingRelTypeOptions.map((rt) => (
                <option key={rt} value={rt}>
                  {getRelationshipTypeLabel(rt)}
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
