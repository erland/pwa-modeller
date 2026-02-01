import { useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type {
  SandboxNode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
  SandboxRelationshipVisibilityMode,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxState,
} from '../workspace/controller/sandboxTypes';

import type { Point } from '../../diagram/geometry';

import { computeSandboxOrthogonalPointsByRelationshipId } from './sandboxRouting';

import '../../../styles/analysisSandbox.css';

import { SaveSandboxAsDiagramDialog } from './SaveSandboxAsDiagramDialog';
import { SandboxInsertDialog } from './SandboxInsertDialog';
import { SandboxCanvas } from './SandboxCanvas';
import { SandboxRelationshipsPanel } from './SandboxRelationshipsPanel';
import { SandboxToolbar } from './SandboxToolbar';
import { useSandboxViewport } from './useSandboxViewport';
import { useSandboxRelationships } from './useSandboxRelationships';
import { useSandboxSelectionController } from './useSandboxSelectionController';
import { useSandboxDialogController } from './useSandboxDialogController';
import { useSandboxDragController } from './useSandboxDragController';
import { SANDBOX_GRID_SIZE, SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';

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
  const {
    svgRef,
    viewBox,
    fitToContent,
    resetView,
    clientToWorld,
    consumeSuppressNextBackgroundClick,
    onPointerDownCanvas,
    onPointerMoveCanvas,
    onPointerUpOrCancelCanvas,
  } = useSandboxViewport({ nodes, nodeW: SANDBOX_NODE_W, nodeH: SANDBOX_NODE_H });

  const [edgeCapDismissed, setEdgeCapDismissed] = useState(false);

  const [insertMode, setInsertMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [insertK, setInsertK] = useState(3);
  const [insertMaxHops, setInsertMaxHops] = useState(8);
  const [insertDirection, setInsertDirection] = useState<SandboxAddRelatedDirection>('both');

  const nodeById = useMemo(() => {
    const m = new Map<string, SandboxNode>();
    for (const n of nodes) m.set(n.elementId, n);
    return m;
  }, [nodes]);

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
  } = useSandboxSelectionController({
    selection,
    selectionElementIds,
    nodeById,
    modelRelationships: model.relationships,
    consumeSuppressNextBackgroundClick,
    onSelectElement,
    onSelectRelationship,
    onClearSelection,
  });

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
  } = useSandboxDialogController({
    pairAnchors,
    insertAnchors,
    addRelatedAnchors,
    selectedEdge,
  });

  const canAddSelected = useMemo(() => {
    for (const id of selectionElementIds) {
      if (!model.elements[id]) continue;
      if (!nodeById.has(id)) return true;
    }
    return false;
  }, [model.elements, nodeById, selectionElementIds]);

  const canRemoveSelected = useMemo(() => {
    for (const id of selectionElementIds) {
      if (nodeById.has(id)) return true;
    }
    return false;
  }, [nodeById, selectionElementIds]);

  const allRelationshipTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(model.relationships)) {
      if (!r.type) continue;
      set.add(r.type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [model.relationships]);

  const {
    isDropTarget,
    onPointerDownNode,
    onPointerMove,
    onPointerUpOrCancel,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useSandboxDragController({
    nodeById,
    model,
    clientToWorld,
    onMoveNode,
    onPointerMoveCanvas,
    onPointerUpOrCancelCanvas,
    nodeW: SANDBOX_NODE_W,
    nodeH: SANDBOX_NODE_H,
    onAddNodeAt,
    onSelectElement,
  });

  const canInsertIntermediates = useMemo(() => {
    // Prefer the local pair selection; fall back to global selection if it happens to include 2 sandbox nodes.
    const anchors = pairAnchors.length ? pairAnchors : insertAnchors;
    // Relationship type filtering is configured in the dialog; don't block opening it.
    return anchors.length === 2;
  }, [insertAnchors, pairAnchors]);

  const canAddRelated = useMemo(() => {
    return addRelatedAnchors.length > 0;
  }, [addRelatedAnchors.length]);

  const {
    baseVisibleRelationships,
    availableRelationshipTypes,
    selectedTypeCount,
    edgeOverflow,
    renderedRelationships,
  } = useSandboxRelationships({
    modelRelationships: model.relationships,
    nodes,
    relationships,
    maxEdges: ui.maxEdges,
    onSetEnabledRelationshipTypes,
  });

  useEffect(() => {
    if (edgeOverflow > 0) setEdgeCapDismissed(false);
  }, [edgeOverflow]);

  const orthogonalPointsByRelationshipId = useMemo(() => {
    if (ui.edgeRouting !== 'orthogonal') return new Map<string, Point[]>();
    if (!relationships.show) return new Map<string, Point[]>();
    if (renderedRelationships.length === 0) return new Map<string, Point[]>();
    return computeSandboxOrthogonalPointsByRelationshipId({
      nodes,
      renderedRelationships,
      nodeW: SANDBOX_NODE_W,
      nodeH: SANDBOX_NODE_H,
      gridSize: SANDBOX_GRID_SIZE,
    });
  }, [nodes, renderedRelationships, relationships.show, ui.edgeRouting]);



  return (
    <div className="crudSection">
      <SandboxToolbar
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
      />

      <SandboxRelationshipsPanel
        nodesCount={nodes.length}
        maxNodes={ui.maxNodes}
        relationships={relationships}
        edgeRouting={ui.edgeRouting}
        baseVisibleRelationshipsCount={baseVisibleRelationships.length}
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
        viewBox={viewBox ?? null}
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

      <SandboxInsertDialog
        kind="intermediates"
        isOpen={insertBetweenDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        sourceElementId={insertBetweenEndpoints?.[0] ?? ''}
        targetElementId={insertBetweenEndpoints?.[1] ?? ''}
        contextLabel="Between"
        existingElementIds={nodes.map((n) => n.elementId)}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{ mode: insertMode, k: insertK, maxHops: insertMaxHops, direction: insertDirection }}
        onCancel={closeInsertBetweenDialog}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          closeInsertBetweenDialog();
          setInsertMode(options.mode);
          setInsertK(options.k);
          setInsertMaxHops(options.maxHops);
          setInsertDirection(options.direction);

          // Keep traversal settings consistent with the insert preview.
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);

          const src = insertBetweenEndpoints?.[0];
          const dst = insertBetweenEndpoints?.[1];
          if (!src || !dst) return;
          onInsertIntermediatesBetween(src, dst, { ...options, allowedElementIds: selectedElementIds });
        }}
      />

      <SandboxInsertDialog
        kind="intermediates"
        isOpen={insertFromEdgeDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        sourceElementId={insertFromEdgeEndpoints?.[0] ?? ''}
        targetElementId={insertFromEdgeEndpoints?.[1] ?? ''}
        contextLabel="From relationship"
        contextRelationshipType={selectedEdge?.type}
        existingElementIds={nodes.map((n) => n.elementId)}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{ mode: insertMode, k: insertK, maxHops: insertMaxHops, direction: insertDirection }}
        onCancel={closeInsertFromEdgeDialog}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          closeInsertFromEdgeDialog();
          setInsertMode(options.mode);
          setInsertK(options.k);
          setInsertMaxHops(options.maxHops);
          setInsertDirection(options.direction);

          // Keep traversal settings consistent with the insert preview.
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);

          const src = insertFromEdgeEndpoints?.[0];
          const dst = insertFromEdgeEndpoints?.[1];
          if (!src || !dst) return;
          onInsertIntermediatesBetween(src, dst, { ...options, allowedElementIds: selectedElementIds });
        }}
      />

      <SandboxInsertDialog
        kind="related"
        isOpen={addRelatedDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        anchorElementIds={addRelatedDialogAnchors}
        existingElementIds={nodes.map((n) => n.elementId)}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{ depth: addRelated.depth, direction: addRelated.direction }}
        onCancel={closeAddRelatedDialog}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          closeAddRelatedDialog();
          // Persist settings for the next time.
          onSetAddRelatedDepth(options.depth);
          onSetAddRelatedDirection(options.direction);
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);
          if (addRelatedDialogAnchors.length === 0) return;
          onAddRelatedFromSelection(addRelatedDialogAnchors, selectedElementIds);
        }}
      />

      <SaveSandboxAsDiagramDialog
        isOpen={saveDialogOpen}
        initialName="Sandbox diagram"
        onCancel={() => setSaveDialogOpen(false)}
        onConfirm={(name) => {
          setSaveDialogOpen(false);
          const ids = renderedRelationships.map((r) => r.id);
          onSaveAsDiagram(name, ids);
        }}
      />
    </div>
  );
}
