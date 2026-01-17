import { useMemo } from 'react';

import type { Model, PathsBetweenResult, RelatedElementsResult } from '../../domain';
import type { AnalysisMode } from './AnalysisQueryPanel';

type GraphNode = {
  id: string;
  label: string;
  level: number;
  order: number;
};

type GraphEdge = {
  fromId: string;
  toId: string;
  relationshipType: string;
  reversed: boolean;
};

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

function labelFor(model: Model, id: string): string {
  const e = model.elements[id];
  return e?.name || '(unnamed)';
}

function stableName(model: Model, id: string): string {
  return `${labelFor(model, id)}\u0000${id}`;
}

function uniqEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const e of edges) {
    const key = `${e.fromId}->${e.toId}:${e.relationshipType}:${e.reversed ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function graphFromRelated(model: Model, related: RelatedElementsResult): GraphData {
  const startId = related.startElementId;
  const hits = related.hits;

  const nodesWanted: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }].concat(
    hits.map((h) => ({ id: h.elementId, distance: h.distance }))
  );

  // Cap nodes (prefer closer distances first).
  nodesWanted.sort((a, b) => a.distance - b.distance || stableName(model, a.id).localeCompare(stableName(model, b.id)));
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
      fromId: via.fromId,
      toId: via.toId,
      relationshipType: String(via.relationshipType),
      reversed: Boolean(via.reversed)
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
    ids.sort((a, b) => stableName(model, a).localeCompare(stableName(model, b)));
    maxLevel = Math.max(maxLevel, level);
    ids.forEach((id, order) => nodes.push({ id, label: labelFor(model, id), level, order }));
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

function graphFromPaths(model: Model, res: PathsBetweenResult): GraphData {
  const nodeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  // Collect union of path nodes/edges.
  for (const p of res.paths) {
    for (const id of p.elementIds) nodeSet.add(id);
    for (const s of p.steps) {
      edges.push({
        fromId: s.fromId,
        toId: s.toId,
        relationshipType: String(s.relationshipType),
        reversed: Boolean(s.reversed)
      });
    }
  }

  // Cap nodes (prefer nearer to source by computed level).
  const nodeList = Array.from(nodeSet);
  nodeList.sort((a, b) => levelForPathsNode(res, a) - levelForPathsNode(res, b) || stableName(model, a).localeCompare(stableName(model, b)));
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
    ids.sort((a, b) => stableName(model, a).localeCompare(stableName(model, b)));
    ids.forEach((id, order) => nodes.push({ id, label: labelFor(model, id), level, order }));
  }

  return {
    nodes,
    edges: edgesKept,
    maxLevel,
    trimmed: { nodes: trimmedNodes, edges: trimmedEdges }
  };
}

function buildGraphData(
  model: Model,
  mode: AnalysisMode,
  relatedResult: RelatedElementsResult | null,
  pathsResult: PathsBetweenResult | null
): GraphData | null {
  if (mode === 'related') {
    if (!relatedResult) return null;
    if (!relatedResult.startElementId) return null;
    if (relatedResult.hits.length === 0) return null;
    return graphFromRelated(model, relatedResult);
  }
  if (!pathsResult) return null;
  if (pathsResult.paths.length === 0) return null;
  return graphFromPaths(model, pathsResult);
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

export function AnalysisMiniGraph({
  model,
  mode,
  relatedResult,
  pathsResult,
  onSelectElement
}: {
  model: Model;
  mode: AnalysisMode;
  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  onSelectElement: (elementId: string) => void;
}) {
  const data = useMemo(() => buildGraphData(model, mode, relatedResult, pathsResult), [
    model,
    mode,
    relatedResult,
    pathsResult
  ]);

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
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
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
              return (
                <path
                  key={`${e.fromId}->${e.toId}:${e.relationshipType}:${e.reversed ? 1 : 0}`}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  markerEnd="url(#arrow)"
                  strokeDasharray={e.reversed ? '4 3' : undefined}
                >
                  <title>{`${labelFor(model, e.fromId)} —[${e.relationshipType}]→ ${labelFor(model, e.toId)}${
                    e.reversed ? ' (reversed)' : ''
                  }`}</title>
                </path>
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
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectElement(n.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') onSelectElement(n.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={8}
                    ry={8}
                    fill="rgba(255,255,255,0.9)"
                    stroke="rgba(0,0,0,0.25)"
                  />
                  <text x={r.x + 10} y={r.y + 22} fontSize={12} style={{ userSelect: 'none' }}>
                    {text}
                    <title>{label}</title>
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {data.trimmed.nodes || data.trimmed.edges ? (
        <p className="crudHint" style={{ marginTop: 8 }}>
          Showing a bounded projection for readability (max {MAX_NODES} nodes, {MAX_EDGES} edges). Use tighter filters to
          reduce the result set.
        </p>
      ) : null}
    </div>
  );
}
