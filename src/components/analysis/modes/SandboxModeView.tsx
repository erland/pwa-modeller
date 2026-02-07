import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type {
  SandboxNode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesOptions,
  SandboxRelationshipVisibilityMode,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxState,
} from '../workspace/controller/sandboxTypes';

import { useSandboxModeController } from './useSandboxModeController';

import '../../../styles/analysisSandbox.css';

import { SandboxModeDialogs } from './SandboxModeDialogs';
import { SandboxModePanels } from './SandboxModePanels';
import { useSandboxShortcuts } from './useSandboxShortcuts';

export function SandboxModeView({
  model,
  nodes,
  relationships,
  addRelated,
  ui,
  selection,
  selectionElementIds,
  onSelectElement,
  onSelectRelationship,
  onClearSelection,
  onMoveNode,
  onAddSelected,
  onRemoveSelected,
  onClear,
  onAddNodeAt,
  onSetShowRelationships,
  onSetRelationshipMode,
  onSetEnabledRelationshipTypes,
  onToggleEnabledRelationshipType,
  onSetAddRelatedDepth,
  onSetAddRelatedDirection,
  onSetAddRelatedEnabledTypes,
  onAddRelatedFromSelection,
  onInsertIntermediatesBetween,
  onSaveAsDiagram,
  onAutoLayout,
  onSetPersistEnabled,
  onSetEdgeRouting,
  onClearWarning,
  onUndoLastInsert,
}: {
  model: Model;
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  addRelated: SandboxState['addRelated'];
  ui: SandboxUiState;
  selection: Selection;
  selectionElementIds: string[];
  onSelectElement: (elementId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
  onClearSelection: () => void;
  onMoveNode: (elementId: string, x: number, y: number) => void;
  onAddSelected: () => void;
  onRemoveSelected: () => void;
  onClear: () => void;
  onAddNodeAt: (elementId: string, x: number, y: number) => void;
  onSetShowRelationships: (show: boolean) => void;
  onSetRelationshipMode: (mode: SandboxRelationshipVisibilityMode) => void;
  onSetEnabledRelationshipTypes: (types: string[]) => void;
  onToggleEnabledRelationshipType: (type: string) => void;
  onSetAddRelatedDepth: (depth: number) => void;
  onSetAddRelatedDirection: (direction: SandboxAddRelatedDirection) => void;
  onSetAddRelatedEnabledTypes: (types: string[]) => void;
  onAddRelatedFromSelection: (anchorElementIds: string[], allowedElementIds?: string[]) => void;
  onInsertIntermediatesBetween: (
    sourceElementId: string,
    targetElementId: string,
    options: SandboxInsertIntermediatesOptions
  ) => void;
  onSaveAsDiagram: (name: string, visibleRelationshipIds: string[]) => void;
  onAutoLayout: () => void;
  onSetPersistEnabled: (enabled: boolean) => void;
  onSetEdgeRouting: (routing: 'straight' | 'orthogonal') => void;
  onClearWarning: () => void;
  onUndoLastInsert: () => void;
}) {
  const ctrl = useSandboxModeController({
    model,
    nodes,
    relationships,
    ui,
    selection,
    selectionElementIds,
    onSelectElement,
    onSelectRelationship,
    onClearSelection,
    onMoveNode,
    onAddNodeAt,
    onSetEnabledRelationshipTypes,
  });

  const {
    viewport,
    nodeById,
    allRelationshipTypes,
    edgeCapDismissed,
    setEdgeCapDismissed,
    canAddSelected,
    canRemoveSelected,
    canInsertIntermediates,
    canAddRelated,
    selectionController,
    dialogController,
    dragController,
    relationshipsController,
    orthogonalPointsByRelationshipId,
    overlay,
    insertUi,
  } = ctrl;

  const {
    svgRef,
    viewBox,
    fitToContent,
    resetView,
    onPointerDownCanvas,
  } = viewport;

  const {
    selectedElementId,
    selectedEdgeId,
    selectedEdge,
    pairAnchors,
    addRelatedAnchors,
    insertAnchors,
    onEdgeHitClick,
    onCanvasClick,
    onClickNode,
  } = selectionController;

  const {
    saveDialogOpen,
    setSaveDialogOpen,
    insertBetweenDialogOpen,
    insertBetweenEndpoints,
    openInsertBetweenDialog,
    closeInsertBetweenDialog,
    insertFromEdgeDialogOpen,
    insertFromEdgeEndpoints,
    openInsertFromSelectedEdgeDialog,
    closeInsertFromEdgeDialog,
    addRelatedDialogOpen,
    addRelatedDialogAnchors,
    openAddRelatedDialog,
    closeAddRelatedDialog,
  } = dialogController;

  const {
    baseVisibleRelationships,
    availableRelationshipTypes,
    selectedTypeCount,
    edgeOverflow,
    renderedRelationships,
  } = relationshipsController;

  const {
    isDropTarget,
    onPointerDownNode,
    onPointerMove,
    onPointerUpOrCancel,
    onDragOver,
    onDragLeave,
    onDrop,
  } = dragController;

  const {
    graphOptions,
    setGraphOptions,
    isOverlayOpen,
    setIsOverlayOpen,
    availablePropertyKeys,
    overlayBadgeByElementId,
    overlayScaleByElementId,
  } = overlay;

  const {
    insertMode,
    setInsertMode,
    insertK,
    setInsertK,
    insertMaxHops,
    setInsertMaxHops,
    insertDirection,
    setInsertDirection,
  } = insertUi;

  const isAnyDialogOpen =
    isOverlayOpen ||
    saveDialogOpen ||
    insertBetweenDialogOpen ||
    insertFromEdgeDialogOpen ||
    addRelatedDialogOpen;

  const closeAllDialogs = () => {
    setIsOverlayOpen(false);
    setSaveDialogOpen(false);
    closeInsertBetweenDialog();
    closeInsertFromEdgeDialog();
    closeAddRelatedDialog();
  };

  useSandboxShortcuts({
    enabled: true,
    isAnyDialogOpen,
    closeAllDialogs,
    clearSelection: onClearSelection,
    canRemoveSelected,
    removeSelected: onRemoveSelected,
  });



  const overlayButton = (
    <button
      type="button"
      className="miniLinkButton"
      onClick={() => setIsOverlayOpen(true)}
      disabled={!nodes.length}
      aria-disabled={!nodes.length}
      aria-label="Overlay settings"
      title="Overlay settings"
    >
      Overlay
    </button>
  );

  return (
    <div className="crudSection">
      <SandboxModePanels
        // Toolbar
        nodesCount={nodes.length}
        ui={ui}
        edgeOverflow={edgeOverflow}
        edgeCapDismissed={edgeCapDismissed}
        onDismissWarnings={() => {
          onClearWarning();
          setEdgeCapDismissed(true);
        }}
        onSaveAsDiagram={() => setSaveDialogOpen(true)}
        onClear={onClear}
        onUndoLastInsert={onUndoLastInsert}
        onAutoLayout={onAutoLayout}
        onFitToContent={fitToContent}
        onResetView={resetView}
        onSetPersistEnabled={onSetPersistEnabled}
        overlayButton={overlayButton}
        canAddSelected={canAddSelected}
        canRemoveSelected={canRemoveSelected}
        canAddRelated={canAddRelated}
        canInsertIntermediates={canInsertIntermediates}
        addSelectedButton={
          <button
            type="button"
            className="miniLinkButton"
            onClick={onAddSelected}
            disabled={!canAddSelected}
            aria-disabled={!canAddSelected}
            title="Add the currently selected element(s) to the sandbox"
          >
            Add selected
          </button>
        }
        removeSelectedButton={
          <button
            type="button"
            className="miniLinkButton"
            onClick={onRemoveSelected}
            disabled={!canRemoveSelected}
            aria-disabled={!canRemoveSelected}
            title="Remove the currently selected element(s) from the sandbox"
          >
            Remove selected
          </button>
        }
        addRelatedButton={
          <button
            type="button"
            className="miniLinkButton"
            onClick={openAddRelatedDialog}
            disabled={!canAddRelated}
            aria-disabled={!canAddRelated}
            title={
              addRelatedAnchors.length
                ? 'Add related elements around the selected sandbox node(s)'
                : 'Select one or more sandbox nodes to expand'
            }
          >
            Add related…
          </button>
        }
        insertIntermediatesButton={
          <button
            type="button"
            className="miniLinkButton"
            onClick={() => {
              if (selectedEdge) {
                openInsertFromSelectedEdgeDialog();
              } else {
                openInsertBetweenDialog();
              }
            }}
            disabled={!selectedEdge && !canInsertIntermediates}
            aria-disabled={!selectedEdge && !canInsertIntermediates}
            title={
              selectedEdge
                ? 'Preview and insert intermediate elements between the selected relationship endpoints'
                : (pairAnchors.length ? pairAnchors : insertAnchors).length === 2
                  ? 'Preview and insert intermediate elements between the two selected sandbox nodes'
                  : 'Pick two sandbox nodes: click first, then Shift-click second'
            }
          >
            Insert intermediate…
          </button>
        }
        // Relationships panel
        relationships={relationships}
        baseVisibleRelationshipsCount={baseVisibleRelationships.length}
        availableRelationshipTypes={availableRelationshipTypes}
        selectedTypeCount={selectedTypeCount}
        onSetShowRelationships={onSetShowRelationships}
        onSetRelationshipMode={onSetRelationshipMode}
        onSetEdgeRouting={onSetEdgeRouting}
        onToggleEnabledRelationshipType={onToggleEnabledRelationshipType}
        onSetEnabledRelationshipTypes={onSetEnabledRelationshipTypes}
        // Canvas
        model={model}
        nodes={nodes}
        selection={selection}
        nodeById={nodeById}
        renderedRelationships={renderedRelationships}
        orthogonalPointsByRelationshipId={orthogonalPointsByRelationshipId}
        selectedElementId={selectedElementId}
        selectedEdgeId={selectedEdgeId}
        pairAnchors={pairAnchors}
        overlayBadgeByElementId={overlayBadgeByElementId}
        overlayScaleByElementId={overlayScaleByElementId}
        svgRef={svgRef}
        viewBox={viewBox ?? null}
        isDropTarget={isDropTarget}
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
        onDoubleClickNode={onSelectElement}
      />

      <SandboxModeDialogs
        model={model}
        ui={ui}
        nodesElementIds={nodes.map((n) => n.elementId)}
        allRelationshipTypes={allRelationshipTypes}
        addRelated={addRelated}
        insertBetweenDialogOpen={insertBetweenDialogOpen}
        insertBetweenEndpoints={insertBetweenEndpoints}
        closeInsertBetweenDialog={closeInsertBetweenDialog}
        insertFromEdgeDialogOpen={insertFromEdgeDialogOpen}
        insertFromEdgeEndpoints={insertFromEdgeEndpoints}
        closeInsertFromEdgeDialog={closeInsertFromEdgeDialog}
        selectedEdgeType={selectedEdge?.type}
        addRelatedDialogOpen={addRelatedDialogOpen}
        addRelatedDialogAnchors={addRelatedDialogAnchors}
        closeAddRelatedDialog={closeAddRelatedDialog}
        insertMode={insertMode}
        setInsertMode={setInsertMode}
        insertK={insertK}
        setInsertK={setInsertK}
        insertMaxHops={insertMaxHops}
        setInsertMaxHops={setInsertMaxHops}
        insertDirection={insertDirection}
        setInsertDirection={setInsertDirection}
        saveDialogOpen={saveDialogOpen}
        setSaveDialogOpen={setSaveDialogOpen}
        onSaveAsDiagram={onSaveAsDiagram}
        getVisibleRelationshipIds={() => renderedRelationships.map((r) => r.id)}
        isOverlayOpen={isOverlayOpen}
        setIsOverlayOpen={setIsOverlayOpen}
        graphOptions={graphOptions}
        setGraphOptions={setGraphOptions}
        availablePropertyKeys={availablePropertyKeys}
        onSetAddRelatedEnabledTypes={onSetAddRelatedEnabledTypes}
        onSetAddRelatedDepth={onSetAddRelatedDepth}
        onSetAddRelatedDirection={onSetAddRelatedDirection}
        onAddRelatedFromSelection={onAddRelatedFromSelection}
        onInsertIntermediatesBetween={onInsertIntermediatesBetween}
      />
    </div>
  );
}