import { useMemo } from 'react';

import type { Model, PathsBetweenResult, RelatedElementsResult } from '../../domain';
import { getElementTypeLabel, getRelationshipTypeLabel } from '../../domain';
import type { AnalysisEdge } from '../../domain/analysis/graph';
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

const ARCHIMATE_LAYER_BG_VAR: Record<ArchimateLayer, string> = {
  Strategy: 'var(--arch-layer-strategy)',
  Motivation: 'var(--arch-layer-motivation)',
  Business: 'var(--arch-layer-business)',
  Application: 'var(--arch-layer-application)',
  Technology: 'var(--arch-layer-technology)',
  Physical: 'var(--arch-layer-physical)',
  ImplementationMigration: 'var(--arch-layer-implementation)'
};

function docSnippet(doc: string | undefined): string {
  const t = (doc ?? '').trim();
  if (!t) return '';
  if (t.length <= 240) return t;
  return `${t.slice(0, 239)}…`;
}

function selectionToRelationshipId(sel: Selection | null | undefined): string | null {
  if (!sel) return null;
  return sel.kind === 'relationship' ? sel.relationshipId : null;
}

function selectionToElementId(sel: Selection | null | undefined): string | null {
  if (!sel) return null;
  return sel.kind === 'element' ? sel.elementId : null;
}

function relationshipIsExplicitlyUndirected(s: TraversalStep): boolean {
  const attrs = s.relationship?.attrs as unknown as { isDirected?: boolean } | undefined;
  return attrs?.isDirected === false;
}

function edgeFromStep(s: TraversalStep): AnalysisEdge {
  return {
    relationshipId: s.relationshipId,
    relationshipType: s.relationshipType,
    relationship: s.relationship,
    fromId: s.fromId,
    toId: s.toId,
    reversed: s.reversed,
    undirected: relationshipIsExplicitlyUndirected(s)
  };
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
  autoFitColumns = true
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

  const selectedRelationshipId = selectionToRelationshipId(selection);
  const selectedElementId = selectionToElementId(selection);

  const elementTooltip = (elementId: string): MiniColumnGraphTooltip | null => {
    const el = model.elements[elementId];
    if (!el) return null;

    const label = labelForId(elementId);
    const facets = adapter.getNodeFacetValues(el, model);

    const lines: string[] = [];
    lines.push(`Id: ${elementId}`);

    const rawType = String((facets.type ?? facets.elementType ?? el.type) ?? '');
    const typeLabel = rawType ? getElementTypeLabel(rawType) : '';
    if (typeLabel) lines.push(`Type: ${typeLabel}`);

    const layer = String((facets.archimateLayer ?? (el as unknown as { layer?: string }).layer) ?? '');
    if (layer) lines.push(`Layer: ${layer}`);

    const doc = docSnippet(el.documentation);
    if (doc) lines.push(`Documentation: ${doc}`);

    return { title: label || String(el.name ?? '') || '(unnamed)', lines };
  };

  const relationshipTooltip = (s: TraversalStep): MiniColumnGraphTooltip | null => {
    const r = s.relationship;
    if (!r) return null;
    const src = r.sourceElementId || s.fromId;
    const tgt = r.targetElementId || s.toId;
    const doc = docSnippet(r.documentation);
    const analysisEdge = edgeFromStep(s);
    const label = adapter.getEdgeLabel(analysisEdge, model);
    const title = r.name && r.name.trim() ? r.name : label;

    const lines: string[] = [];
    lines.push(`Type: ${r.type !== 'Unknown' ? getRelationshipTypeLabel(r.type) : r.unknownType?.name ? `Unknown: ${r.unknownType.name}` : 'Unknown'}`);
    if (src) lines.push(`From: ${labelForId(src)}`);
    if (tgt) lines.push(`To: ${labelForId(tgt)}`);
    if (doc) lines.push(`Documentation: ${doc}`);

    return { title: title || '(relationship)', lines };
  };

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

      return { id: n.id, label: n.label, level: n.level, order: n.order, bg };
    });
  }, [safeData.nodes, getElementBgVar, model.elements, modelKind]);

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
        <p className="crudTitle" style={{ margin: 0 }}>
          Graph
        </p>
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
