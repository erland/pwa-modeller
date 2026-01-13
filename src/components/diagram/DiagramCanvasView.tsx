import type * as React from 'react';
import type { Model, RelationshipType, View, ViewNodeLayout } from '../../domain';
import type { Notation } from '../../notations';
import { Dialog } from '../dialog/Dialog';

import type { Selection } from '../model/selection';
import type { Point } from './geometry';
import type { DiagramLinkDrag, DiagramNodeDragState } from './DiagramNode';
import type { ConnectableRef } from './connectable';

import type { GroupBoxDraft, ToolMode } from './hooks/useDiagramToolState';
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
  onAddAndJunction,
  onAddOrJunction,
}: DiagramCanvasViewProps) {
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

        {activeView?.kind === 'uml' ? (
          <div className="diagramToolbarTools" role="group" aria-label="UML palette">
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addUmlClass' ? ' isActive' : '')}
              onClick={() => setToolMode('addUmlClass')}
              disabled={!activeViewId}
              title="Place a UML Class (click to drop)"
            >
              Class
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addUmlInterface' ? ' isActive' : '')}
              onClick={() => setToolMode('addUmlInterface')}
              disabled={!activeViewId}
              title="Place a UML Interface (click to drop)"
            >
              Interface
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addUmlEnum' ? ' isActive' : '')}
              onClick={() => setToolMode('addUmlEnum')}
              disabled={!activeViewId}
              title="Place a UML Enum (click to drop)"
            >
              Enum
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addUmlPackage' ? ' isActive' : '')}
              onClick={() => setToolMode('addUmlPackage')}
              disabled={!activeViewId}
              title="Place a UML Package (click to drop)"
            >
              Package
            </button>
            <button
              type="button"
              className={'shellButton' + (toolMode === 'addUmlNote' ? ' isActive' : '')}
              onClick={() => setToolMode('addUmlNote')}
              disabled={!activeViewId}
              title="Place a UML Note (click to drop)"
            >
              UML Note
            </button>
          </div>
        ) : null}

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
          {activeView?.kind === 'archimate' ? (
            <>
              <button className="shellButton" type="button" disabled={!activeViewId} title="Add AND junction" onClick={onAddAndJunction}>
                +AND
              </button>
              <button className="shellButton" type="button" disabled={!activeViewId} title="Add OR junction" onClick={onAddOrJunction}>
                +OR
              </button>
            </>
          ) : null}
          <button className="shellButton" type="button" onClick={onExportImage} disabled={!canExportImage}>
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
                style={{
                  width: surfaceWidthModel,
                  height: surfaceHeightModel,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
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