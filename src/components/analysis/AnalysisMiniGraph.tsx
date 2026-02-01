import { useMemo } from 'react';

import type { AnalysisDirection, RelationshipType, NodeMetricId, Model, PathsBetweenResult, RelatedElementsResult } from '../../domain';
import { buildAnalysisGraph, computeNodeMetric, readNumericPropertyFromElement } from '../../domain';
import type { TraversalStep } from '../../domain/analysis/traverse';
import type { ArchimateLayer, ElementType } from '../../domain/types';
import type { ModelKind } from '../../domain/types';
import type { Selection } from '../model/selection';
import type { AnalysisMode } from './AnalysisQueryPanel';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { buildMiniGraphData, MINI_GRAPH_MAX_EDGES, MINI_GRAPH_MAX_NODES } from '../../domain/analysis/miniGraph';
import type { MiniGraphData, MiniGraphMode } from '../../domain/analysis/miniGraph';

import { useElementBgVar } from '../diagram/hooks/useElementBgVar';

import { MiniColumnGraph } from './MiniColumnGraph';
import type { MiniColumnGraphTooltip, MiniColumnGraphEdge, MiniColumnGraphNode } from './MiniColumnGraph';

import { buildElementTooltip, buildRelationshipTooltipFromTraversalStep } from './tooltip/buildTooltips';

const ARCHIMATE_LAYER_BG_VAR: Record<ArchimateLayer, string> = {
  Strategy: 'var(--arch-layer-strategy)',
  Motivation: 'var(--arch-layer-motivation)',
  Business: 'var(--arch-layer-business)',
  Application: 'var(--arch-layer-application)',
  Technology: 'var(--arch-layer-technology)',
  Physical: 'var(--arch-layer-physical)',
  ImplementationMigration: 'var(--arch-layer-implementation)'
};

function selectionToRelationshipId(sel: Selection | null | undefined): string | null {
  if (!sel) return null;
  return sel.kind === 'relationship' ? sel.relationshipId : null;
}

function selectionToElementId(sel: Selection | null | undefined): string | null {
  if (!sel) return null;
  return sel.kind === 'element' ? sel.elementId : null;
}

function edgeIdForStep(step: TraversalStep) {
  // relationshipId alone is not unique (multiple endpoints or reversed rendering), so keep a stable per-edge id.
  return `${step.relationshipId}:${step.fromId}->${step.toId}${step.reversed ? ':r' : ''}`;
}

export function AnalysisMiniGraph({
  model,
  modelKind,
  mode,
  relatedResult,
  pathsResult,
  selection,
  onSelectElement,
  onSelectRelationship,
  wrapLabels = true,
  autoFitColumns = true,
  nodeOverlayMetricId = 'off',
  nodeOverlayReachDepth = 3,
  nodeOverlayPropertyKey = '',
  scaleNodesByOverlayScore = false,
  overlayDirection = 'both',
  overlayRelationshipTypes,
  onOpenInSandbox
}: {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;
  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  selection?: Selection;
  onSelectElement: (elementId: string) => void;
  onSelectRelationship?: (relationshipId: string) => void;
  wrapLabels?: boolean;
  autoFitColumns?: boolean;
  nodeOverlayMetricId?: 'off' | NodeMetricId;
  nodeOverlayReachDepth?: 2 | 3 | 4;
  nodeOverlayPropertyKey?: string;
  scaleNodesByOverlayScore?: boolean;
  overlayDirection?: AnalysisDirection;
  overlayRelationshipTypes?: RelationshipType[];
  onOpenInSandbox?: (args: {
    elementIds: string[];
    relationshipIds: string[];
    layout: { mode: 'levels'; levelById: Record<string, number>; orderById: Record<string, number> };
  }) => void;
}) {
  const adapter = getAnalysisAdapter(modelKind);
  const { getElementBgVar } = useElementBgVar();

  const labelForId = useMemo(() => {
    return (id: string): string => {
      const el = model.elements[id];
      return el ? adapter.getNodeLabel(el, model) : '(missing)';
    };
  }, [adapter, model]);

  const m: MiniGraphMode = mode === 'related' ? 'related' : 'paths';

  const data: MiniGraphData | null = useMemo(() => {
    return buildMiniGraphData(labelForId, m, relatedResult, pathsResult);
  }, [labelForId, m, relatedResult, pathsResult]);

  const safeData: MiniGraphData =
    data ?? { nodes: [], edges: [], maxLevel: 0, trimmed: { nodes: false, edges: false } };

  const analysisGraph = useMemo(() => {
    if (nodeOverlayMetricId === 'off') return null;
    return buildAnalysisGraph(model);
  }, [model, nodeOverlayMetricId]);

  const nodeOverlayScores = useMemo(() => {
    if (nodeOverlayMetricId === 'off') return null;
    if (!analysisGraph) return null;

    const nodeIds = safeData.nodes.map((n) => n.id);
    const relationshipTypes = overlayRelationshipTypes && overlayRelationshipTypes.length ? overlayRelationshipTypes : undefined;

    if (nodeOverlayMetricId === 'nodeReach') {
      return computeNodeMetric(analysisGraph, 'nodeReach', {
        direction: overlayDirection,
        relationshipTypes,
        maxDepth: nodeOverlayReachDepth,
        nodeIds,
        // Defensive cap: avoids worst-case blowups on dense graphs.
        maxVisited: 5000
      });
    }

    if (nodeOverlayMetricId === 'nodePropertyNumber') {
      const key = (nodeOverlayPropertyKey ?? '').trim();
      if (!key) return {};
      return computeNodeMetric(analysisGraph, 'nodePropertyNumber', {
        key,
        nodeIds,
        getValueByNodeId: (nodeId, k) => readNumericPropertyFromElement(model.elements[nodeId], k)
      });
    }

    return computeNodeMetric(analysisGraph, nodeOverlayMetricId, {
      direction: overlayDirection,
      relationshipTypes,
      nodeIds
    });
  }, [analysisGraph, nodeOverlayMetricId, nodeOverlayReachDepth, nodeOverlayPropertyKey, overlayDirection, overlayRelationshipTypes, safeData.nodes, model.elements]);

  const selectedRelationshipId = selectionToRelationshipId(selection);
  const selectedElementId = selectionToElementId(selection);

  const elementTooltip = (elementId: string): MiniColumnGraphTooltip | null => buildElementTooltip(adapter, model, elementId);

  const relationshipTooltip = (s: TraversalStep): MiniColumnGraphTooltip | null =>
    buildRelationshipTooltipFromTraversalStep(adapter, model, s, labelForId);

  // Edge lookup for selection + tooltip.
  const edgeById = useMemo(() => {
    const map: Record<string, TraversalStep> = {};
    for (const e of safeData.edges) map[edgeIdForStep(e)] = e;
    return map;
  }, [safeData.edges]);

  const graphEdges: MiniColumnGraphEdge[] = useMemo(() => {
    return safeData.edges.map((e) => ({ id: edgeIdForStep(e), from: e.fromId, to: e.toId }));
  }, [safeData.edges]);

  const graphNodes: MiniColumnGraphNode[] = useMemo(() => {
    const shouldScale = Boolean(scaleNodesByOverlayScore && nodeOverlayMetricId !== 'off' && nodeOverlayScores);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    if (shouldScale) {
      for (const n of safeData.nodes) {
        const v = nodeOverlayScores ? nodeOverlayScores[n.id] : undefined;
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }

    const computeScale = (score: number | undefined): number | undefined => {
      if (!shouldScale) return undefined;
      if (typeof score !== 'number' || !Number.isFinite(score)) return 1;
      if (!(max > min)) return 1;
      const t = (score - min) / (max - min);
      // Clamp to a subtle range to avoid layout blowups.
      return 0.85 + Math.max(0, Math.min(1, t)) * (1.25 - 0.85);
    };

    return safeData.nodes.map((n) => {
      const el = model.elements[n.id];

      // Prefer layer colors in ArchiMate, fallback to type-based colors.
      let bg = 'rgba(255,255,255,0.9)';
      if (modelKind === 'archimate' && el) {
        const layer = (el as unknown as { layer?: ArchimateLayer }).layer;
        const layerFill = layer ? ARCHIMATE_LAYER_BG_VAR[layer] : undefined;
        bg = layerFill ?? getElementBgVar(el.type as ElementType);
      } else if (el) {
        bg = getElementBgVar(el.type as ElementType);
      }

      // Score overlay touchpoint (Step 4+): when enabled, we can add a badge suffix to `label` or provide
      // additional style hints (e.g., scale) based on computed per-node metric values for the nodes in `safeData`.
      const score = nodeOverlayScores ? nodeOverlayScores[n.id] : undefined;
      const badge = typeof score === 'number' ? String(score) : undefined;
      const sizeScale = computeScale(score);
      return { id: n.id, label: n.label, level: n.level, order: n.order, bg, badge, sizeScale };
    });
  }, [safeData.nodes, getElementBgVar, model.elements, modelKind, nodeOverlayScores, nodeOverlayMetricId, scaleNodesByOverlayScore]);

  const getEdgeTooltip = (edgeId: string): MiniColumnGraphTooltip | null => {
    const step = edgeById[edgeId];
    if (!step) return null;
    return relationshipTooltip(step);
  };

  const onSelectEdge = onSelectRelationship
    ? (edgeId: string) => {
        const step = edgeById[edgeId];
        if (!step) return;
        onSelectRelationship(step.relationshipId);
      }
    : undefined;

  const isEdgeActive = selectedRelationshipId
    ? (edgeId: string) => edgeById[edgeId]?.relationshipId === selectedRelationshipId
    : undefined;

  const title = mode === 'related' ? 'Mini graph (related elements)' : 'Mini graph (connection paths)';

  // Nothing to show
  if (!data) return null;

  return (
    <div style={{ marginTop: 10 }} aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <p className="crudTitle" style={{ margin: 0 }}>
            Graph
          </p>
          {onOpenInSandbox ? (
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => {
                const elementIds = safeData.nodes.map((n) => n.id);
                const relationshipIds = Array.from(new Set(safeData.edges.map((e) => e.relationshipId))).sort((a, b) => a.localeCompare(b));
                const levelById: Record<string, number> = {};
                const orderById: Record<string, number> = {};
                for (const n of safeData.nodes) {
                  levelById[n.id] = n.level;
                  orderById[n.id] = n.order;
                }
                onOpenInSandbox({ elementIds, relationshipIds, layout: { mode: 'levels', levelById, orderById } });
              }}
              disabled={safeData.nodes.length === 0}
              aria-disabled={safeData.nodes.length === 0}
              title="Open this mini graph as a Sandbox"
            >
              Open in Sandbox
            </button>
          ) : null}
        </div>
        <p className="crudHint" style={{ margin: 0 }}>
          {safeData.nodes.length} nodes, {safeData.edges.length} edges
          {safeData.trimmed.nodes || safeData.trimmed.edges ? ' (trimmed)' : ''}
        </p>
      </div>

      <div style={{ marginTop: 8, maxHeight: 520, background: 'var(--panelBg, rgba(255,255,255,0.6))' }}>
        <MiniColumnGraph
          nodes={graphNodes}
          edges={graphEdges}
          selectedNodeId={selectedElementId}
          selectedEdgeId={null}
          isEdgeActive={isEdgeActive}
          onSelectNode={onSelectElement}
          onSelectEdge={onSelectEdge}
          getNodeTooltip={elementTooltip}
          getEdgeTooltip={onSelectRelationship ? getEdgeTooltip : undefined}
          wrapLabels={wrapLabels}
          autoFitColumns={autoFitColumns}
          responsive={true}
          ariaLabel={title}
          containerStyle={{ borderRadius: 8, border: '1px solid var(--borderColor, rgba(0,0,0,0.15))' }}
        />
      </div>

      {safeData.trimmed.nodes || safeData.trimmed.edges ? (
        <p className="crudHint" style={{ marginTop: 8 }}>
          Showing a bounded projection for readability (max {MINI_GRAPH_MAX_NODES} nodes, {MINI_GRAPH_MAX_EDGES} edges). Use tighter filters to reduce the result set.
        </p>
      ) : null}

      {onSelectRelationship ? (
        <p className="crudHint" style={{ marginTop: 8 }}>
          Tip: click an edge to select the relationship and view its properties.
        </p>
      ) : null}
    </div>
  );
}
