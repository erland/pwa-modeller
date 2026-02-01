import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent } from 'react';

import type { Model, Relationship } from '../../../domain';
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

import { dataTransferHasElement, readDraggedElementId } from '../../diagram/dragDrop';

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
import { SANDBOX_GRID_SIZE, SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';

function blurDocumentActiveElement(): void {
  const active = document.activeElement;
  if (!active) return;
  if (active instanceof HTMLElement) {
    active.blur();
    return;
  }

  // Some browsers can place focus on SVG elements; blur() isn't always typed on Element.
  const maybe = active as unknown as { blur?: () => void };
  if (typeof maybe.blur === 'function') maybe.blur();
}

type DragState = {
  elementId: string;
  offsetX: number;
  offsetY: number;
};

function getSelectedElementId(selection: Selection): string | null {
  switch (selection.kind) {
    case 'element':
      return selection.elementId;
    case 'viewNode':
      return selection.elementId;
    case 'viewNodes':
      return selection.elementIds[0] ?? null;
    default:
      return null;
  }
}

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

  const [drag, setDrag] = useState<DragState | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Sandbox-local pair selection for "Insert between selection".
  // Keeps sandbox operations independent from the global single-selection UX.
  const [pairSelection, setPairSelection] = useState<string[]>([]);

  // Keep local edge highlight in sync with global selection so the PropertiesPanel
  // can drive relationship selection.
  useEffect(() => {
    if (selection.kind === 'relationship') {
      setSelectedEdgeId(selection.relationshipId);
      setPairSelection([]);
      return;
    }
    setSelectedEdgeId(null);
  }, [selection]);

  const [edgeCapDismissed, setEdgeCapDismissed] = useState(false);

  const [insertMode, setInsertMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [insertK, setInsertK] = useState(3);
  const [insertMaxHops, setInsertMaxHops] = useState(8);
  const [insertDirection, setInsertDirection] = useState<SandboxAddRelatedDirection>('both');

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [insertBetweenDialogOpen, setInsertBetweenDialogOpen] = useState(false);
  const [insertBetweenEndpoints, setInsertBetweenEndpoints] = useState<[string, string] | null>(null);
  const [insertFromEdgeDialogOpen, setInsertFromEdgeDialogOpen] = useState(false);
  const [insertFromEdgeEndpoints, setInsertFromEdgeEndpoints] = useState<[string, string] | null>(null);

  const [addRelatedDialogOpen, setAddRelatedDialogOpen] = useState(false);
  const [addRelatedDialogAnchors, setAddRelatedDialogAnchors] = useState<string[]>([]);

  const selectedElementId = useMemo(() => getSelectedElementId(selection), [selection]);

  const nodeById = useMemo(() => {
    const m = new Map<string, SandboxNode>();
    for (const n of nodes) m.set(n.elementId, n);
    return m;
  }, [nodes]);

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

  const addRelatedAnchors = useMemo(() => {
    const raw = pairSelection.length ? pairSelection : selectionElementIds;
    const uniq = Array.from(new Set(raw.filter((id) => nodeById.has(id))));
    return uniq;
  }, [nodeById, pairSelection, selectionElementIds]);

  const insertAnchors = useMemo(() => {
    const uniq = Array.from(new Set(selectionElementIds.filter((id) => nodeById.has(id))));
    return uniq;
  }, [nodeById, selectionElementIds]);

  const pairAnchors = useMemo(() => {
    const uniq = Array.from(new Set(pairSelection.filter((id) => nodeById.has(id))));
    return uniq.slice(0, 2);
  }, [nodeById, pairSelection]);

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

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const r = (model.relationships as Record<string, Relationship | undefined>)[selectedEdgeId];
    if (!r) return null;
    if (!r.sourceElementId || !r.targetElementId) return null;
    if (!nodeById.has(r.sourceElementId)) return null;
    if (!nodeById.has(r.targetElementId)) return null;
    return {
      id: r.id,
      type: String(r.type),
      sourceElementId: r.sourceElementId,
      targetElementId: r.targetElementId,
    };
  }, [model.relationships, nodeById, selectedEdgeId]);

  const onEdgeHitClick = useCallback(
    (e: MouseEvent<SVGPathElement>, relationshipId: string) => {
      e.stopPropagation();

      // Toggle relationship selection: clicking the selected edge again clears selection.
      if (selectedEdgeId === relationshipId) {
        // Clear any lingering focus ring (Safari can be sticky).
        blurDocumentActiveElement();
        setSelectedEdgeId(null);
        setPairSelection([]);
        onClearSelection();
        return;
      }

      setSelectedEdgeId(relationshipId);
      setPairSelection([]);
      onSelectRelationship(relationshipId);
    },
    [onClearSelection, onSelectRelationship, selectedEdgeId]
  );

  const onPointerDownNode = useCallback(
    (e: PointerEvent<SVGGElement>, elementId: string) => {
      const node = nodeById.get(elementId);
      if (!node) return;
      const p = clientToWorld(e.clientX, e.clientY);
      setDrag({ elementId, offsetX: p.x - node.x, offsetY: p.y - node.y });
      (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [clientToWorld, nodeById]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      // Node drag has priority.
      if (drag) {
        const p = clientToWorld(e.clientX, e.clientY);
        const nx = p.x - drag.offsetX;
        const ny = p.y - drag.offsetY;
        onMoveNode(drag.elementId, nx, ny);
        e.preventDefault();
        return;
      }

      onPointerMoveCanvas(e);
    },
    [clientToWorld, drag, onMoveNode, onPointerMoveCanvas]
  );

  const onPointerUpOrCancel = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (drag) {
        setDrag(null);
        try {
          (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      onPointerUpOrCancelCanvas(e);
    },
    [drag, onPointerUpOrCancelCanvas]
  );

  const onDragOver = useCallback((e: DragEvent<SVGSVGElement>) => {
    if (!dataTransferHasElement(e.dataTransfer)) return;
    e.preventDefault();
    setIsDropTarget(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<SVGSVGElement>) => {
      setIsDropTarget(false);
      if (!dataTransferHasElement(e.dataTransfer)) return;
      e.preventDefault();

      const id = readDraggedElementId(e.dataTransfer);
      if (!id) return;
      if (!model.elements[id]) return;

      const p = clientToWorld(e.clientX, e.clientY);
      const x = p.x - SANDBOX_NODE_W / 2;
      const y = p.y - SANDBOX_NODE_H / 2;
      onAddNodeAt(id, x, y);
      onSelectElement(id);
    },
    [clientToWorld, model.elements, onAddNodeAt, onSelectElement]
  );

  const onOpenInsertBetweenDialog = useCallback(() => {
    const anchors = pairAnchors.length ? pairAnchors : insertAnchors;
    if (anchors.length !== 2) return;
    setInsertBetweenEndpoints([anchors[0], anchors[1]]);
    setInsertBetweenDialogOpen(true);
  }, [insertAnchors, pairAnchors]);

  const onOpenInsertFromSelectedEdgeDialog = useCallback(() => {
    if (!selectedEdge) return;
    setInsertFromEdgeEndpoints([selectedEdge.sourceElementId, selectedEdge.targetElementId]);
    setInsertFromEdgeDialogOpen(true);
  }, [selectedEdge]);

  const onOpenAddRelatedDialog = useCallback(() => {
    if (addRelatedAnchors.length === 0) return;
    setAddRelatedDialogAnchors(addRelatedAnchors);
    setAddRelatedDialogOpen(true);
  }, [addRelatedAnchors]);

  const onCanvasClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      // Only treat clicks on the SVG background as "clear selection".
      if (e.target !== e.currentTarget) return;
      if (consumeSuppressNextBackgroundClick()) return;
      // Clear any focus ring that might linger on previously clicked SVG elements (notably relationships).
      // Some browsers (e.g. Safari) can keep a focus outline even after selection state is cleared.
      blurDocumentActiveElement();
      setSelectedEdgeId(null);
      setPairSelection([]);
      onClearSelection();
    },
    [consumeSuppressNextBackgroundClick, onClearSelection]
  );

  const onClickNode = useCallback(
    (e: MouseEvent<SVGGElement>, elementId: string) => {
      e.stopPropagation();
      setSelectedEdgeId(null);

      if (e.shiftKey) {
        setPairSelection((prev) => {
          const cur = prev.filter(Boolean);
          if (cur.length === 0) return [elementId];
          if (cur.length === 1) {
            return cur[0] === elementId ? [] : [cur[0], elementId];
          }

          const [a, b] = cur;
          if (elementId === a) return [b];
          if (elementId === b) return [a];
          // Replace the secondary selection but keep the primary stable.
          return [a, elementId];
        });
      } else {
        // Normal click sets a single local selection (primary).
        setPairSelection([elementId]);
      }

      onSelectElement(elementId);
    },
    [onSelectElement]
  );

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
            onClick={onOpenAddRelatedDialog}
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
                onOpenInsertFromSelectedEdgeDialog();
              } else {
                onOpenInsertBetweenDialog();
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
        onCancel={() => setInsertBetweenDialogOpen(false)}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          setInsertBetweenDialogOpen(false);
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
        onCancel={() => setInsertFromEdgeDialogOpen(false)}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          setInsertFromEdgeDialogOpen(false);
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
	        onCancel={() => setAddRelatedDialogOpen(false)}
	        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
	          setAddRelatedDialogOpen(false);
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
