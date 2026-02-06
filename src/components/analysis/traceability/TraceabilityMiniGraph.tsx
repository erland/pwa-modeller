import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';

import type { AnalysisDirection, ElementType, Model, NodeMetricId, RelationshipType } from '../../../domain';
import { buildAnalysisGraph, computeNodeMetric, readNumericPropertyFromElement } from '../../../domain';
import type { ModelKind } from '../../../domain/types';
import type { TraceEdge, TraceNode, TraceSelection } from '../../../domain/analysis/traceability/types';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { useElementBgVar } from '../../diagram/hooks/useElementBgVar';

import type { MiniColumnGraphTooltip } from '../MiniColumnGraph';
import { MiniColumnGraph } from '../MiniColumnGraph';
import { AnalysisSection } from '../layout/AnalysisSection';

import { buildElementTooltip, buildRelationshipTooltipFromRelationshipId } from '../tooltip/buildTooltips';

import { getEffectiveTagsForElement, overlayStore, useOverlayStore } from '../../../store/overlay';

type Props = {
  model: Model;
  modelKind: ModelKind;
  nodesById: Record<string, TraceNode>;
  edgesById: Record<string, TraceEdge>;
  selection: TraceSelection;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onExpandNode: (id: string, direction: 'incoming' | 'outgoing' | 'both') => void;
  onTogglePin: (id: string) => void;

  wrapLabels?: boolean;
  autoFitColumns?: boolean;

  // Node overlay metric (same semantics as AnalysisMiniGraph).
  nodeOverlayMetricId?: 'off' | NodeMetricId;
  nodeOverlayReachDepth?: 2 | 3 | 4;
  nodeOverlayPropertyKey?: string;
  scaleNodesByOverlayScore?: boolean;

  overlayDirection?: AnalysisDirection;
  overlayRelationshipTypes?: RelationshipType[];

  /**
   * If false, renders only the graph (no surrounding AnalysisSection).
   * Useful when the caller wants to place graph actions in a higher-level Results header.
   */
  wrapInSection?: boolean;

  headerControls?: ReactNode;
};

export function TraceabilityMiniGraph({
  model,
  modelKind,
  nodesById,
  edgesById,
  selection,
  onSelectNode,
  onSelectEdge,
  onExpandNode,
  onTogglePin,
  wrapLabels = true,
  autoFitColumns = true,
  nodeOverlayMetricId = 'off',
  nodeOverlayReachDepth = 3,
  nodeOverlayPropertyKey = '',
  scaleNodesByOverlayScore = false,
  overlayDirection = 'both',
  overlayRelationshipTypes,
  wrapInSection = true,
  headerControls
}: Props) {
  const adapter = getAnalysisAdapter(modelKind);
  const { getElementBgVar } = useElementBgVar();
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  const labelForId = useCallback(
    (id: string) => {
      const el = model.elements[id];
      if (!el) return id;
      const name = String(el.name ?? '').trim();
      return name || id;
    },
    [model]
  );

  const elementTooltip = (elementId: string): MiniColumnGraphTooltip | null => buildElementTooltip(adapter, model, elementId);

  const edgeTooltip = (edgeId: string): MiniColumnGraphTooltip | null => {
    const e = edgesById[edgeId];
    if (!e) return null;
    return buildRelationshipTooltipFromRelationshipId(model, {
      relationshipId: e.relationshipId,
      relationshipType: e.type,
      fromId: e.from,
      toId: e.to,
      labelForId
    });
  };

  const renderInlineControls = (nodeId: string, nodeWidth: number) => {
    const node = nodesById[nodeId];
    if (!node) return null;

    const iconStyle: CSSProperties = {
      width: 18,
      height: 18,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      border: '1px solid rgba(0,0,0,0.22)',
      background: 'rgba(255,255,255,0.75)',
      cursor: 'pointer',
      userSelect: 'none'
    };

    return (
      <g transform={`translate(${Math.max(10, nodeWidth - 10 - 4 * 24)},${8})`}>
        <foreignObject width={4 * 24} height={22}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div
              style={iconStyle}
              title="Expand incoming"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onExpandNode(nodeId, 'incoming');
              }}
            >
              ←
            </div>
            <div
              style={iconStyle}
              title="Expand outgoing"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onExpandNode(nodeId, 'outgoing');
              }}
            >
              →
            </div>
            <div
              style={iconStyle}
              title="Expand both"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onExpandNode(nodeId, 'both');
              }}
            >
              ⇄
            </div>
            <div
              style={{
                ...iconStyle,
                fontWeight: node.pinned ? 700 : 400
              }}
              title={node.pinned ? 'Unpin' : 'Pin'}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onTogglePin(nodeId);
              }}
            >
              📌
            </div>
          </div>
        </foreignObject>
      </g>
    );
  };

  const analysisGraph = useMemo(() => {
    if (nodeOverlayMetricId === 'off') return null;
    return buildAnalysisGraph(model);
  }, [model, nodeOverlayMetricId]);

  const nodeOverlayScores = useMemo(() => {
    // overlayStore reference is stable; overlayVersion is the change signal.
    void overlayVersion;

    if (nodeOverlayMetricId === 'off') return null;
    if (!analysisGraph) return null;

    const nodeIds = Object.values(nodesById)
      .filter((n) => !n.hidden)
      .map((n) => n.id);

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
        getValueByNodeId: (nodeId, k) =>
          readNumericPropertyFromElement(model.elements[nodeId], k, {
            getTaggedValues: (el) => getEffectiveTagsForElement(model, el, overlayStore).effectiveTaggedValues
          })
      });
    }

    return computeNodeMetric(analysisGraph, nodeOverlayMetricId, {
      direction: overlayDirection,
      relationshipTypes,
      nodeIds
    });
  }, [analysisGraph, nodeOverlayMetricId, nodeOverlayReachDepth, nodeOverlayPropertyKey, overlayDirection, overlayRelationshipTypes, nodesById, model, overlayVersion]);

  const graphNodes = useMemo(() => {
    const shouldScale = Boolean(scaleNodesByOverlayScore && nodeOverlayMetricId !== 'off' && nodeOverlayScores);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    if (shouldScale) {
      for (const n of Object.values(nodesById)) {
        if (n.hidden) continue;
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

    const list: Array<{ id: string; label: string; level: number; bg?: string; badge?: string; sizeScale?: number; hidden?: boolean }> = [];
    for (const n of Object.values(nodesById)) {
      const label = labelForId(n.id);
      const el = model.elements[n.id];
      const facets = el ? adapter.getNodeFacetValues(el, model) : {};
      const et = (facets.elementType ?? facets.type ?? el?.type) as unknown as ElementType | undefined;
      const bg = et ? getElementBgVar(et) : 'var(--arch-layer-business)';

      const score = nodeOverlayScores ? nodeOverlayScores[n.id] : undefined;
      const badge = typeof score === 'number' ? String(score) : undefined;
      const sizeScale = computeScale(score);
      list.push({ id: n.id, label, level: n.depth, bg, badge, sizeScale, hidden: n.hidden });
    }
    return list;
  }, [adapter, getElementBgVar, labelForId, model, nodesById, nodeOverlayScores, nodeOverlayMetricId, scaleNodesByOverlayScore]);

  const graphEdges = useMemo(() => {
    return Object.values(edgesById).map((e) => ({ id: e.id, from: e.from, to: e.to, hidden: e.hidden }));
  }, [edgesById]);

  const graph = (
    <MiniColumnGraph
      nodes={graphNodes}
      edges={graphEdges}
      selectedNodeId={selection.selectedNodeId}
      selectedEdgeId={selection.selectedEdgeId}
      onSelectNode={onSelectNode}
      onSelectEdge={onSelectEdge}
      getNodeTooltip={elementTooltip}
      getEdgeTooltip={edgeTooltip}
      renderNodeControls={renderInlineControls}
      wrapLabels={wrapLabels}
      autoFitColumns={autoFitColumns}
      ariaLabel="Traceability mini graph"
    />
  );

  if (!wrapInSection) return graph;

  return (
    <AnalysisSection title="Traceability graph" hint="Click nodes/edges to select." actions={headerControls}>
      {graph}
    </AnalysisSection>
  );
}
