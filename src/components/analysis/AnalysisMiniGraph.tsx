import { useMemo, useState } from 'react';

import type {
  Model,
  PathsBetweenResult,
  RelatedElementsResult,
  TraversalStep,
  ArchimateLayer,
  ElementType
} from '../../domain';
import type { AnalysisEdge } from '../../domain/analysis/graph';
import type { ModelKind } from '../../domain/types';
import type { Selection } from '../model/selection';
import type { AnalysisMode } from './AnalysisQueryPanel';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { useElementBgVar } from '../diagram/hooks/useElementBgVar';

import { QuickTooltip } from './QuickTooltip';

const ARCHIMATE_LAYER_BG_VAR: Record<ArchimateLayer, string> = {
  Strategy: 'var(--arch-layer-strategy)',
  Motivation: 'var(--arch-layer-motivation)',
  Business: 'var(--arch-layer-business)',
  Application: 'var(--arch-layer-application)',
  Technology: 'var(--arch-layer-technology)',
  Physical: 'var(--arch-layer-physical)',
  ImplementationMigration: 'var(--arch-layer-implementation)'
};

type GraphNode = {
  id: string;
  label: string;
  level: number;
  order: number;
};

type GraphEdge = TraversalStep;

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxLevel: number;
  trimmed: {
    nodes: boolean;
    edges: boolean;
  };
};

const MAX_NODES = 150;
const MAX_EDGES = 300;

function docSnippet(doc: string | undefined): string {
  const t = (doc ?? '').trim();
  if (!t) return '';
  if (t.length <= 240) return t;
  return `${t.slice(0, 239)}…`;
}

function stableName(labelForId: (id: string) => string, id: string): string {
  return `${labelForId(id)}\u0000${id}`;
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

function uniqEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const e of edges) {
    const key = `${e.relationshipId}:${e.fromId}->${e.toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function graphFromRelated(related: RelatedElementsResult, labelForId: (id: string) => string): GraphData {
  const startId = related.startElementId;
  const hits = related.hits;

  const nodesWanted: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }].concat(
    hits.map((h) => ({ id: h.elementId, distance: h.distance }))
  );

  // Cap nodes (prefer closer distances first).
  nodesWanted.sort((a, b) => a.distance - b.distance || stableName(labelForId, a.id).localeCompare(stableName(labelForId, b.id)));
  const trimmedNodes = nodesWanted.length > MAX_NODES;
  const kept = nodesWanted.slice(0, MAX_NODES);

  const nodeSet = new Set<string>(kept.map((n) => n.id));

  // Build edges from the stored predecessor step (a BFS-tree projection).
  const edges: GraphEdge[] = [];
  for (const h of hits) {
    if (!nodeSet.has(h.elementId)) continue;
    const via = h.via;
    if (!via) continue;
    if (!nodeSet.has(via.fromId) || !nodeSet.has(via.toId)) continue;
    edges.push({
      ...via
    });
  }

  const edgesUniq = uniqEdges(edges);
  const trimmedEdges = edgesUniq.length > MAX_EDGES;
  const edgesKept = edgesUniq.slice(0, MAX_EDGES);

  // Compute ordering per level.
  const byLevel = new Map<number, string[]>();
  for (const n of kept) {
    const level = n.distance;
    const arr = byLevel.get(level) ?? [];
    arr.push(n.id);
    byLevel.set(level, arr);
  }

  const nodes: GraphNode[] = [];
  let maxLevel = 0;
  for (const [level, ids] of byLevel.entries()) {
    ids.sort((a, b) => stableName(labelForId, a).localeCompare(stableName(labelForId, b)));
    maxLevel = Math.max(maxLevel, level);
    ids.forEach((id, order) => nodes.push({ id, label: labelForId(id), level, order }));
  }

  return {
    nodes,
    edges: edgesKept,
    maxLevel,
    trimmed: { nodes: trimmedNodes, edges: trimmedEdges }
  };
}

function levelForPathsNode(paths: PathsBetweenResult, nodeId: string): number {
  // Assign level by earliest position in any path.
  let best: number | undefined;
  for (const p of paths.paths) {
    const idx = p.elementIds.indexOf(nodeId);
    if (idx < 0) continue;
    if (best === undefined || idx < best) best = idx;
  }
  return best ?? 0;
}

function graphFromPaths(res: PathsBetweenResult, labelForId: (id: string) => string): GraphData {
  const nodeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  // Collect union of path nodes/edges.
  for (const p of res.paths) {
    for (const id of p.elementIds) nodeSet.add(id);
    for (const s of p.steps) {
      edges.push(s);
    }
  }

  // Cap nodes (prefer nearer to source by computed level).
  const nodeList = Array.from(nodeSet);
  nodeList.sort(
    (a, b) =>
      levelForPathsNode(res, a) - levelForPathsNode(res, b) ||
      stableName(labelForId, a).localeCompare(stableName(labelForId, b))
  );
  const trimmedNodes = nodeList.length > MAX_NODES;
  const keptNodes = nodeList.slice(0, MAX_NODES);
  const keptSet = new Set<string>(keptNodes);

  const edgesUniq = uniqEdges(edges).filter((e) => keptSet.has(e.fromId) && keptSet.has(e.toId));
  const trimmedEdges = edgesUniq.length > MAX_EDGES;
  const edgesKept = edgesUniq.slice(0, MAX_EDGES);

  // Group nodes by level.
  const byLevel = new Map<number, string[]>();
  let maxLevel = 0;
  for (const id of keptNodes) {
    const lvl = levelForPathsNode(res, id);
    maxLevel = Math.max(maxLevel, lvl);
    const arr = byLevel.get(lvl) ?? [];
    arr.push(id);
    byLevel.set(lvl, arr);
  }

  const nodes: GraphNode[] = [];
  for (const [level, ids] of byLevel.entries()) {
    ids.sort((a, b) => stableName(labelForId, a).localeCompare(stableName(labelForId, b)));
    ids.forEach((id, order) => nodes.push({ id, label: labelForId(id), level, order }));
  }

  return {
    nodes,
    edges: edgesKept,
    maxLevel,
    trimmed: { nodes: trimmedNodes, edges: trimmedEdges }
  };
}

function buildGraphData(
  labelForId: (id: string) => string,
  mode: AnalysisMode,
  relatedResult: RelatedElementsResult | null,
  pathsResult: PathsBetweenResult | null
): GraphData | null {
  if (mode === 'related') {
    if (!relatedResult) return null;
    if (!relatedResult.startElementId) return null;
    if (relatedResult.hits.length === 0) return null;
    return graphFromRelated(relatedResult, labelForId);
  }
  if (!pathsResult) return null;
  if (pathsResult.paths.length === 0) return null;
  return graphFromPaths(pathsResult, labelForId);
}

function nodeRect() {
  const w = 170;
  const h = 34;
  return { w, h };
}

function nodeXY(node: GraphNode, yCountByLevel: Map<number, number>) {
  const xSpacing = 220;
  const ySpacing = 56;
  const marginX = 24;
  const marginY = 24;

  const count = yCountByLevel.get(node.level) ?? 1;
  const totalH = Math.max(1, count) * ySpacing;
  const baseY = marginY;
  const y = baseY + node.order * ySpacing;

  const x = marginX + node.level * xSpacing;
  return { x, y, totalH };
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

function summarizeDoc(doc: string | undefined, max = 260): string {
  const s = (doc ?? '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function AnalysisMiniGraph({
  model,
  modelKind,
  mode,
  relatedResult,
  pathsResult,
  selection,
  onSelectElement,
  onSelectRelationship
}: {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;
  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  selection?: Selection;
  onSelectElement: (elementId: string) => void;
  onSelectRelationship?: (relationshipId: string) => void;
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
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? el.layer) ?? '');
    const doc = docSnippet(el.documentation);
    const lines: string[] = [];
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc}`);
    return { title: el.name || '(unnamed)', lines };
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

  const data = useMemo(
    () => buildGraphData(labelForId, mode, relatedResult, pathsResult),
    [labelForId, mode, relatedResult, pathsResult]
  );

  const selectedRelationshipId = selectionToRelationshipId(selection);

  const yCountByLevel = useMemo(() => {
    const map = new Map<number, number>();
    if (!data) return map;
    for (const n of data.nodes) map.set(n.level, (map.get(n.level) ?? 0) + 1);
    return map;
  }, [data]);

  const positioned = useMemo(() => {
    const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
    if (!data) return { rects, maxX: 360, maxY: 220 };

    let maxY = 0;
    let maxX = 0;
    for (const n of data.nodes) {
      const { w, h } = nodeRect();
      const { x, y } = nodeXY(n, yCountByLevel);
      rects.set(n.id, { x, y, w, h });
      maxY = Math.max(maxY, y + h);
      maxX = Math.max(maxX, x + w);
    }
    return { rects, maxX: maxX + 24, maxY: maxY + 24 };
  }, [data, yCountByLevel]);

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
          Showing a bounded projection for readability (max {MAX_NODES} nodes, {MAX_EDGES} edges). Use tighter filters to reduce the result set.
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
