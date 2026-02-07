import { useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import type { Selection } from '../../model/selection';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxNode,
  SandboxRelationshipsState,
SandboxUiState } from '../workspace/controller/sandboxTypes';

import { SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';
import { useSandboxGraph } from './useSandboxGraph';

import { useSandboxViewport } from './useSandboxViewport';
import { useSandboxSelectionController } from './useSandboxSelectionController';
import { useSandboxDialogController } from './useSandboxDialogController';
import { useSandboxDragController } from './useSandboxDragController';
import { useSandboxRelationships } from './useSandboxRelationships';
import { useMiniGraphOptionsForModel } from '../results/useMiniGraphOptionsForModel';

import { computeNodeMetric, readNumericPropertyFromElement } from '../../../domain';
import { getEffectiveTagsForElement, overlayStore, useOverlayStore } from '../../../store/overlay';

import {
  computeOverlayScalesFromScores,
  formatOverlayBadgesFromScores,
  getAvailablePropertyKeys,
} from './sandboxUtils';

export function useSandboxModeController({
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
  onSetEnabledRelationshipTypes }: {
  model: Model;
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  ui: SandboxUiState;
  selection: Selection;
  selectionElementIds: string[];
  onSelectElement: (elementId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
  onClearSelection: () => void;
  onMoveNode: (elementId: string, x: number, y: number) => void;
  onAddNodeAt: (elementId: string, x: number, y: number) => void;
  onSetEnabledRelationshipTypes: (types: string[]) => void;
}) {
  // --- Viewport
  const viewport = useSandboxViewport({ nodes, nodeW: SANDBOX_NODE_W, nodeH: SANDBOX_NODE_H });

  // --- Local UI state
  const [edgeCapDismissed, setEdgeCapDismissed] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const [insertMode, setInsertMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [insertK, setInsertK] = useState(3);
  const [insertMaxHops, setInsertMaxHops] = useState(8);
  const [insertDirection, setInsertDirection] = useState<SandboxAddRelatedDirection>('both');

  // --- Relationships visibility/filtering
  const relationshipsController = useSandboxRelationships({
    modelRelationships: model.relationships,
    nodes,
    relationships,
    maxEdges: ui.maxEdges,
    onSetEnabledRelationshipTypes,
  });

  useEffect(() => {
    if (relationshipsController.edgeOverflow > 0) setEdgeCapDismissed(false);
  }, [relationshipsController.edgeOverflow]);

  // --- Derived graph/model computations
  const {
    nodeById,
    sandboxNodeById,
    sandboxSubModel,
    sandboxRelationshipsModel,
    allRelationshipTypes,
    overlayRelationshipTypes,
    orthogonalPointsByRelationshipId,
    analysisGraph,
  } = useSandboxGraph({
    model,
    nodes,
    renderedRelationships: relationshipsController.renderedRelationships,
    relationshipsShow: relationships.show,
    edgeRouting: ui.edgeRouting,
    nodeW: SANDBOX_NODE_W,
    nodeH: SANDBOX_NODE_H,
  });

  // --- Selection
  const selectionController = useSandboxSelectionController({
    selection,
    selectionElementIds,
    nodeById: sandboxNodeById,
    modelRelationships: model.relationships,
    consumeSuppressNextBackgroundClick: viewport.consumeSuppressNextBackgroundClick,
    onSelectElement,
    onSelectRelationship,
    onClearSelection });

  // --- Dialogs
  const dialogController = useSandboxDialogController({
    pairAnchors: selectionController.pairAnchors,
    insertAnchors: selectionController.insertAnchors,
    addRelatedAnchors: selectionController.addRelatedAnchors,
    selectedEdge: selectionController.selectedEdge });

  // --- Capability flags
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

  const canInsertIntermediates = useMemo(() => {
    // Prefer the local pair selection; fall back to global selection if it happens to include 2 sandbox nodes.
    const anchors = selectionController.pairAnchors.length
      ? selectionController.pairAnchors
      : selectionController.insertAnchors;
    return anchors.length === 2;
  }, [selectionController.insertAnchors, selectionController.pairAnchors]);

  const canAddRelated = useMemo(() => selectionController.addRelatedAnchors.length > 0, [selectionController.addRelatedAnchors.length]);

  // --- Drag/drop
  const dragController = useSandboxDragController({
    nodeById: sandboxNodeById,
    model,
    clientToWorld: viewport.clientToWorld,
    onMoveNode,
    onPointerMoveCanvas: viewport.onPointerMoveCanvas,
    onPointerUpOrCancelCanvas: viewport.onPointerUpOrCancelCanvas,
    nodeW: SANDBOX_NODE_W,
    nodeH: SANDBOX_NODE_H,
    onAddNodeAt,
    onSelectElement });

  // --- Overlay settings + derived overlay scores/badges/scales
  const modelId = model.id ?? '';
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  const { graphOptions, setGraphOptions } = useMiniGraphOptionsForModel(modelId);

  const availablePropertyKeys = useMemo(() => {
    // overlayStore reference is stable; overlayVersion is the change signal.
    void overlayVersion;
    return getAvailablePropertyKeys(sandboxRelationshipsModel, {
      getTaggedValues: (el) =>
        getEffectiveTagsForElement(sandboxRelationshipsModel, el, overlayStore).effectiveTaggedValues });
  }, [sandboxRelationshipsModel, overlayVersion]);

  const nodeOverlayScores = useMemo(() => {
    // overlayStore reference is stable; overlayVersion is the change signal.
    void overlayVersion;

    if (graphOptions.nodeOverlayMetricId === 'off') return null;
    if (!nodes.length) return null;

    const nodeIds = nodes.map((n) => n.elementId);
    const relationshipTypes = overlayRelationshipTypes;

    if (graphOptions.nodeOverlayMetricId === 'nodeReach') {
      return computeNodeMetric(analysisGraph, 'nodeReach', {
        direction: 'both',
        relationshipTypes,
        maxDepth: graphOptions.nodeOverlayReachDepth,
        nodeIds,
        maxVisited: 5000 });
    }

    if (graphOptions.nodeOverlayMetricId === 'nodePropertyNumber') {
      const key = (graphOptions.nodeOverlayPropertyKey ?? '').trim();
      if (!key) return { };
      return computeNodeMetric(analysisGraph, 'nodePropertyNumber', {
        key,
        nodeIds,
        getValueByNodeId: (nodeId, k) =>
          readNumericPropertyFromElement(sandboxRelationshipsModel.elements[nodeId], k, {
            getTaggedValues: (el) =>
              getEffectiveTagsForElement(sandboxRelationshipsModel, el, overlayStore).effectiveTaggedValues }) });
    }

    return computeNodeMetric(analysisGraph, graphOptions.nodeOverlayMetricId, {
      direction: 'both',
      relationshipTypes,
      nodeIds });
  }, [
    sandboxRelationshipsModel,
    nodes,
    analysisGraph,
    graphOptions.nodeOverlayMetricId,
    graphOptions.nodeOverlayReachDepth,
    graphOptions.nodeOverlayPropertyKey,
    overlayRelationshipTypes,
    overlayVersion,
  ]);

  const overlayBadgeByElementId = useMemo(() => {
    if (!nodeOverlayScores || graphOptions.nodeOverlayMetricId === 'off') return null;
    return formatOverlayBadgesFromScores(nodeOverlayScores);
  }, [nodeOverlayScores, graphOptions.nodeOverlayMetricId]);

  const overlayScaleByElementId = useMemo(() => {
    if (!nodeOverlayScores || !graphOptions.scaleNodesByOverlayScore || graphOptions.nodeOverlayMetricId === 'off') {
      return null;
    }
    return computeOverlayScalesFromScores(nodeOverlayScores);
  }, [nodeOverlayScores, graphOptions.scaleNodesByOverlayScore, graphOptions.nodeOverlayMetricId]);

  return {
    viewport,
    nodeById,
    sandboxNodeById,
    sandboxSubModel,
    sandboxRelationshipsModel,
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
    overlay: {
      modelId,
      graphOptions,
      setGraphOptions,
      isOverlayOpen,
      setIsOverlayOpen,
      availablePropertyKeys,
      overlayBadgeByElementId,
      overlayScaleByElementId },
    insertUi: {
      insertMode,
      setInsertMode,
      insertK,
      setInsertK,
      insertMaxHops,
      setInsertMaxHops,
      insertDirection,
      setInsertDirection } };
}
