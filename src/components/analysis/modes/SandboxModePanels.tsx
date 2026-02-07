import type { DragEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';

import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type {
  SandboxNode,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxRelationshipVisibilityMode,
} from '../workspace/controller/sandboxTypes';

import type { SandboxRenderableRelationship } from './SandboxEdgesLayer';
import type { Point } from '../../diagram/geometry';

import { SandboxCanvas } from './SandboxCanvas';
import { SandboxRelationshipsPanel } from './SandboxRelationshipsPanel';
import { SandboxToolbar } from './SandboxToolbar';

/**
 * Presentational wrapper that renders the Sandbox toolbar, relationships panel and canvas.
 * This keeps SandboxModeView focused on composing controllers and wiring callbacks.
 */
export function SandboxModePanels({
  // Toolbar
  nodesCount,
  ui,
  edgeOverflow,
  edgeCapDismissed,
  onDismissWarnings,
  onSaveAsDiagram,
  onClear,
  onUndoLastInsert,
  onAutoLayout,
  onFitToContent,
  onResetView,
  onSetPersistEnabled,
  overlayButton,
  canAddSelected,
  canRemoveSelected,
  canAddRelated,
  canInsertIntermediates,
  addSelectedButton,
  removeSelectedButton,
  addRelatedButton,
  insertIntermediatesButton,

  // Relationships panel
  relationships,
  baseVisibleRelationshipsCount,
  availableRelationshipTypes,
  selectedTypeCount,
  onSetShowRelationships,
  onSetRelationshipMode,
  onSetEdgeRouting,
  onToggleEnabledRelationshipType,
  onSetEnabledRelationshipTypes,

  // Canvas
  model,
  nodes,
  selection,
  nodeById,
  renderedRelationships,
  orthogonalPointsByRelationshipId,
  selectedElementId,
  selectedEdgeId,
  pairAnchors,
  overlayBadgeByElementId,
  overlayScaleByElementId,
  svgRef,
  viewBox,
  isDropTarget,
  onPointerDownCanvas,
  onPointerMove,
  onPointerUpOrCancel,
  onDragOver,
  onDragLeave,
  onDrop,
  onCanvasClick,
  onEdgeHitClick,
  onPointerDownNode,
  onClickNode,
  onDoubleClickNode,
}: {
  nodesCount: number;
  ui: SandboxUiState;
  edgeOverflow: number;
  edgeCapDismissed: boolean;
  onDismissWarnings: () => void;
  onSaveAsDiagram: () => void;
  onClear: () => void;
  onUndoLastInsert: () => void;
  onAutoLayout: () => void;
  onFitToContent: () => void;
  onResetView: () => void;
  onSetPersistEnabled: (enabled: boolean) => void;
  overlayButton: ReactNode;
  canAddSelected: boolean;
  canRemoveSelected: boolean;
  canAddRelated: boolean;
  canInsertIntermediates: boolean;
  addSelectedButton: ReactNode;
  removeSelectedButton: ReactNode;
  addRelatedButton: ReactNode;
  insertIntermediatesButton: ReactNode;

  relationships: SandboxRelationshipsState;
  baseVisibleRelationshipsCount: number;
  availableRelationshipTypes: string[];
  selectedTypeCount: number;
  onSetShowRelationships: (show: boolean) => void;
  onSetRelationshipMode: (mode: SandboxRelationshipVisibilityMode) => void;
  onSetEdgeRouting: (routing: 'straight' | 'orthogonal') => void;
  onToggleEnabledRelationshipType: (type: string) => void;
  onSetEnabledRelationshipTypes: (types: string[]) => void;

  model: Model;
  nodes: SandboxNode[];
  selection: Selection;
  nodeById: Map<string, { x: number; y: number }>;
  renderedRelationships: SandboxRenderableRelationship[];
  orthogonalPointsByRelationshipId: Map<string, Point[]>;
  selectedElementId: string | null;
  selectedEdgeId: string | null;
  pairAnchors: string[];
  overlayBadgeByElementId: Record<string, string> | null;
  overlayScaleByElementId: Record<string, number> | null;
  svgRef: RefObject<SVGSVGElement>;
  viewBox: string | null;
  isDropTarget: boolean;
  onPointerDownCanvas: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUpOrCancel: (e: PointerEvent<SVGSVGElement>) => void;
  onDragOver: (e: DragEvent<SVGSVGElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<SVGSVGElement>) => void;
  onCanvasClick: (e: MouseEvent<SVGSVGElement>) => void;
  onEdgeHitClick: (e: MouseEvent<SVGPathElement>, relationshipId: string) => void;
  onPointerDownNode: (e: PointerEvent<SVGGElement>, elementId: string) => void;
  onClickNode: (e: MouseEvent<SVGGElement>, elementId: string) => void;
  onDoubleClickNode: (elementId: string) => void;
}) {
  return (
    <>
      <SandboxToolbar
        nodesCount={nodesCount}
        ui={ui}
        edgeOverflow={edgeOverflow}
        edgeCapDismissed={edgeCapDismissed}
        onDismissWarnings={onDismissWarnings}
        onSaveAsDiagram={onSaveAsDiagram}
        onClear={onClear}
        onUndoLastInsert={onUndoLastInsert}
        onAutoLayout={onAutoLayout}
        onFitToContent={onFitToContent}
        onResetView={onResetView}
        onSetPersistEnabled={onSetPersistEnabled}
        overlayButton={overlayButton}
        canAddSelected={canAddSelected}
        canRemoveSelected={canRemoveSelected}
        canAddRelated={canAddRelated}
        canInsertIntermediates={canInsertIntermediates}
        addSelectedButton={addSelectedButton}
        removeSelectedButton={removeSelectedButton}
        addRelatedButton={addRelatedButton}
        insertIntermediatesButton={insertIntermediatesButton}
      />

      <SandboxRelationshipsPanel
        nodesCount={nodesCount}
        maxNodes={ui.maxNodes}
        relationships={relationships}
        edgeRouting={ui.edgeRouting}
        baseVisibleRelationshipsCount={baseVisibleRelationshipsCount}
        availableRelationshipTypes={availableRelationshipTypes}
        selectedTypeCount={selectedTypeCount}
        enabledTypes={relationships.enabledTypes}
        explicitIdsCount={relationships.explicitIds.length}
        onSetShowRelationships={onSetShowRelationships}
        onSetRelationshipMode={onSetRelationshipMode}
        onSetEdgeRouting={onSetEdgeRouting}
        onToggleEnabledRelationshipType={onToggleEnabledRelationshipType}
        onSetEnabledRelationshipTypes={onSetEnabledRelationshipTypes}
      />

      <SandboxCanvas
        svgRef={svgRef}
        viewBox={viewBox}
        isDropTarget={isDropTarget}
        nodes={nodes}
        model={model}
        selectedElementId={selectedElementId}
        pairAnchors={pairAnchors}
        selection={selection}
        nodeById={nodeById}
        renderedRelationships={renderedRelationships}
        edgeRouting={ui.edgeRouting}
        orthogonalPointsByRelationshipId={orthogonalPointsByRelationshipId}
        selectedEdgeId={selectedEdgeId}
        overlayBadgeByElementId={overlayBadgeByElementId}
        overlayScaleByElementId={overlayScaleByElementId}
        onPointerDownCanvas={onPointerDownCanvas}
        onPointerMove={onPointerMove}
        onPointerUpOrCancel={onPointerUpOrCancel}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onCanvasClick={onCanvasClick}
        onEdgeHitClick={onEdgeHitClick}
        onPointerDownNode={onPointerDownNode}
        onClickNode={onClickNode}
        onDoubleClickNode={onDoubleClickNode}
      />
    </>
  );
}
