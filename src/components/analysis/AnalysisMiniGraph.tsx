import { useMemo, useState } from 'react';

import type {
  Model,
  PathsBetweenResult,
  RelatedElementsResult,
  TraversalStep,
  ArchimateLayer,
  ElementType
} from '../../domain';
import type { MiniGraphData, MiniGraphNode } from '../../domain/analysis/miniGraph';
import type { AnalysisEdge } from '../../domain/analysis/graph';
import type { ModelKind } from '../../domain/types';
import type { Selection } from '../model/selection';
import type { AnalysisMode } from './AnalysisQueryPanel';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { useElementBgVar } from '../diagram/hooks/useElementBgVar';

import { QuickTooltip } from './QuickTooltip';
import { measureTextPx, measureWrappedLabel, wrapLabel } from './graphLabelLayout';

import { buildMiniGraphData, MINI_GRAPH_MAX_EDGES, MINI_GRAPH_MAX_NODES } from '../../domain/analysis/miniGraph';

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

function nodeRect() {
  // Base width; height becomes dynamic based on wrapped label (up to 3 lines).
  const w = 190;
  const h = 34;
  return { w, h };
}

function nodeXY(node: MiniGraphNode, xByLevel: Map<number, number>) {
  const ySpacing = 74; // allow up to 3 lines of text without overlap
  const marginY = 24;

  const y = marginY + node.order * ySpacing;
  const x = xByLevel.get(node.level) ?? 24;
  return { x, y };
}

function edgePath(from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;

  const dx = Math.max(40, (x2 - x1) / 2);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

function selectionToRelationshipId(sel: Selection | null | undefined): string | null {
  if (!sel) return null;
  return sel.kind === 'relationship' ? sel.relationshipId : null;
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
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    lines: string[];
  } | null>(null);

  const labelForId = useMemo(() => {
    return (id: string): string => {
      const el = model.elements[id];
      return el ? adapter.getNodeLabel(el, model) : '(missing)';
    };
  }, [adapter, model]);

  const elementTooltip = (elementId: string): { title: string; lines: string[] } | null => {
    const el = model.elements[elementId];
    if (!el) return null;

    const fullLabel = labelForId(elementId);
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? el.layer) ?? '');
    const doc = docSnippet(el.documentation);

    const lines: string[] = [];
    lines.push(`Id: ${elementId}`);
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc}`);

    return { title: fullLabel || el.name || '(unnamed)', lines };
  };

  const relationshipTooltip = (s: TraversalStep): { title: string; lines: string[] } | null => {
    const r = s.relationship;
    if (!r) return null;
    const src = r.sourceElementId || s.fromId;
    const tgt = r.targetElementId || s.toId;
    const doc = docSnippet(r.documentation);
    const analysisEdge = edgeFromStep(s);
    const label = adapter.getEdgeLabel(analysisEdge, model);
    const title = (r.name && r.name.trim()) ? r.name : label;
    const lines: string[] = [];
    lines.push(`Type: ${r.type}`);
    if (src) lines.push(`From: ${labelForId(src)}`);
    if (tgt) lines.push(`To: ${labelForId(tgt)}`);
    if (doc) lines.push(`Documentation: ${doc}`);
    return { title: title || '(relationship)', lines };
  };

  const data: MiniGraphData | null = useMemo(() => {
    // Keep the component's public `mode` type, but adapt it to the domain helper.
    const m = mode === 'related' ? 'related' : 'paths';
    return buildMiniGraphData(labelForId, m, relatedResult, pathsResult);
  }, [labelForId, mode, relatedResult, pathsResult]);

  const selectedRelationshipId = selectionToRelationshipId(selection);

  const positioned = useMemo(() => {
    const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
    const linesById = new Map<string, string[]>();
    if (!data) return { rects, linesById, maxX: 360, maxY: 220 };

    const base = nodeRect();
    const font = '12px system-ui';
    const paddingX = 20;

    // Group nodes per column/level
    const byLevel = new Map<number, MiniGraphNode[]>();
    for (const n of data.nodes) {
      const arr = byLevel.get(n.level) ?? [];
      arr.push(n);
      byLevel.set(n.level, arr);
    }

    // 1) Column widths.
    // If auto-fit is off -> fixed base width.
    // If wrapLabels is on -> base measurement uses wrapped line widths.
    // If wrapLabels is off -> measure the full label width to reduce truncation (bounded to 1.5x).
    const colWByLevel = new Map<number, number>();
    for (const [level, nodes] of byLevel.entries()) {
      if (!autoFitColumns) {
        colWByLevel.set(level, base.w);
        continue;
      }

      const maxNeeded = nodes.reduce((m, n) => {
        const label = n.label || labelForId(n.id);
        if (wrapLabels) {
          const wrapped = wrapLabel(label, { maxWidthPx: base.w - paddingX, maxLines: 3, font, measureTextPx });
          const metrics = measureWrappedLabel(wrapped, font, measureTextPx);
          return Math.max(m, metrics.maxLineWidthPx);
        }
        return Math.max(m, measureTextPx(label, font));
      }, 0);

      const desired = maxNeeded + paddingX;
      const bounded = Math.min(base.w * 1.5, Math.max(base.w, desired));
      colWByLevel.set(level, bounded);
    }

    // 2) X offsets
    const colGap = 40;
    const marginX = 24;
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const xByLevel = new Map<number, number>();
    let xCursor = marginX;
    for (const level of levels) {
      xByLevel.set(level, xCursor);
      xCursor += (colWByLevel.get(level) ?? base.w) + colGap;
    }

    // 3) Position nodes and wrap with the effective column width
    let maxY = 0;
    for (const n of data.nodes) {
      const nodeW = colWByLevel.get(n.level) ?? base.w;
      const maxTextW = nodeW - paddingX;
      const label = n.label || labelForId(n.id);
      const wrapped = wrapLabel(label, { maxWidthPx: maxTextW, maxLines: wrapLabels ? 3 : 1, font, measureTextPx });

      const lineHeight = 14;
      const paddingY = 10;
      const h = wrapLabels ? Math.max(base.h, paddingY + wrapped.lines.length * lineHeight + paddingY) : base.h;

      const { x, y } = nodeXY(n, xByLevel);
      rects.set(n.id, { x, y, w: nodeW, h });
      linesById.set(n.id, wrapped.lines);

      maxY = Math.max(maxY, y + h);
    }

    const maxX = xCursor + 60;

    return { rects, linesById, maxX, maxY: maxY + 24 };
  }, [data, labelForId, wrapLabels, autoFitColumns]);

  if (!data) return null;

  const title = mode === 'related' ? 'Mini graph (related elements)' : 'Mini graph (connection paths)';

  return (
    <div style={{ marginTop: 10 }} aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p className="crudTitle" style={{ margin: 0 }}>
          Graph
        </p>
        <p className="crudHint" style={{ margin: 0 }}>
          {data.nodes.length} nodes, {data.edges.length} edges
          {data.trimmed.nodes || data.trimmed.edges ? ' (trimmed)' : ''}
        </p>
      </div>

      <div
        style={{
          marginTop: 8,
          border: '1px solid var(--borderColor, rgba(0,0,0,0.15))',
          borderRadius: 8,
          overflow: 'auto',
          maxHeight: 520,
          background: 'var(--panelBg, rgba(255,255,255,0.6))'
        }}
      >
        <svg
          width="100%"
          height={Math.max(220, Math.min(520, positioned.maxY))}
          viewBox={`0 0 ${Math.max(360, positioned.maxX)} ${Math.max(220, positioned.maxY)}`}
          role="img"
          aria-label={title}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {/* Edges */}
          <g style={{ color: 'rgba(0,0,0,0.55)' }}>
            {data.edges.map((e) => {
              const from = positioned.rects.get(e.fromId);
              const to = positioned.rects.get(e.toId);
              if (!from || !to) return null;
              const d = edgePath(from, to);
              const isSelected = selectedRelationshipId === e.relationshipId;
              const key = `${e.relationshipId}:${e.fromId}->${e.toId}`;

              const analysisEdge = edgeFromStep(e);
              const rel = adapter.getEdgeLabel(analysisEdge, model);
              const directed = adapter.isEdgeDirected(analysisEdge, model);
              const arrow = directed ? '→' : '—';
              const rev = e.reversed && directed ? ' (reversed)' : '';
              const tip = relationshipTooltip(e);
              const label = `${labelForId(e.fromId)} —[${rel}]${arrow} ${labelForId(e.toId)}${rev}`;
              const svgTitle = tip ? `${tip.title}\n${tip.lines.join('\n')}` : label;

              return (
                <g key={key}>
                  {/* Click target */}
                  {onSelectRelationship ? (
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={10}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => {
                        onSelectRelationship(e.relationshipId);
                        const tip = relationshipTooltip(e);
                        if (tip) setTooltip({ x: ev.clientX, y: ev.clientY, title: tip.title, lines: tip.lines });
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') onSelectRelationship(e.relationshipId);
                      }}
                    />
                  ) : null}

                  {/* Visible edge */}
                  <path
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isSelected ? 3 : 1.5}
                    markerEnd={directed ? 'url(#arrow)' : undefined}
                    strokeDasharray={e.reversed && directed ? '4 3' : undefined}
                    opacity={isSelected ? 1 : 0.9}
                  >
                    <title>{svgTitle}</title>
                  </path>
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {data.nodes.map((n) => {
              const r = positioned.rects.get(n.id);
              if (!r) return null;
              const label = n.label;
              const text = label.length > 26 ? `${label.slice(0, 25)}…` : label;
              const el = model.elements[n.id];
              const tip = elementTooltip(n.id);
              const svgTitle = tip ? `${tip.title}\n${tip.lines.join('\n')}` : label;

              let fill = 'rgba(255,255,255,0.9)';
              if (modelKind === 'archimate' && el) {
                const layer = (el as unknown as { layer?: string }).layer;
                const layerFill = layer ? (ARCHIMATE_LAYER_BG_VAR as unknown as Record<string, string>)[layer] : undefined;
                fill = layerFill ?? getElementBgVar(el.type as ElementType);
              }
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    onSelectElement(n.id);
                    const tip = elementTooltip(n.id);
                    if (tip) setTooltip({ x: ev.clientX, y: ev.clientY, title: tip.title, lines: tip.lines });
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') onSelectElement(n.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={8} ry={8} fill={fill} stroke="rgba(0,0,0,0.25)" />
                  <text x={r.x + 10} y={r.y + 22} fontSize={12} style={{ userSelect: 'none' }}>
                    {text}
                    <title>{svgTitle}</title>
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <QuickTooltip
        open={Boolean(tooltip)}
        x={tooltip?.x ?? 0}
        y={tooltip?.y ?? 0}
        title={tooltip?.title ?? ''}
        lines={tooltip?.lines ?? []}
        onClose={() => setTooltip(null)}
      />

      {data.trimmed.nodes || data.trimmed.edges ? (
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
