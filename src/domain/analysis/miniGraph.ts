import type { PathsBetweenResult } from './queries/pathsBetween';
import type { RelatedElementsResult } from './queries/relatedElements';
import type { TraversalStep } from './traverse';

export type MiniGraphMode = 'related' | 'paths';

export type MiniGraphNode = {
  id: string;
  label: string;
  level: number;
  order: number;
};

export type MiniGraphEdge = TraversalStep;

export type MiniGraphData = {
  nodes: MiniGraphNode[];
  edges: MiniGraphEdge[];
  maxLevel: number;
  trimmed: {
    nodes: boolean;
    edges: boolean;
  };
};

export const MINI_GRAPH_MAX_NODES = 150;
export const MINI_GRAPH_MAX_EDGES = 300;

function stableName(labelForId: (id: string) => string, id: string): string {
  return `${labelForId(id)}\u0000${id}`;
}

function uniqEdges(edges: MiniGraphEdge[]): MiniGraphEdge[] {
  const seen = new Set<string>();
  const out: MiniGraphEdge[] = [];
  for (const e of edges) {
    const key = `${e.relationshipId}:${e.fromId}->${e.toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function graphFromRelated(related: RelatedElementsResult, labelForId: (id: string) => string): MiniGraphData {
  const startId = related.startElementId;
  const hits = related.hits;

  const nodesWanted: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }].concat(
    hits.map((h) => ({ id: h.elementId, distance: h.distance }))
  );

  // Cap nodes (prefer closer distances first).
  nodesWanted.sort(
    (a, b) =>
      a.distance - b.distance || stableName(labelForId, a.id).localeCompare(stableName(labelForId, b.id))
  );
  const trimmedNodes = nodesWanted.length > MINI_GRAPH_MAX_NODES;
  const kept = nodesWanted.slice(0, MINI_GRAPH_MAX_NODES);

  const nodeSet = new Set<string>(kept.map((n) => n.id));

  // Build edges from the stored predecessor step (a BFS-tree projection).
  const edges: MiniGraphEdge[] = [];
  for (const h of hits) {
    if (!nodeSet.has(h.elementId)) continue;
    const via = h.via;
    if (!via) continue;
    if (!nodeSet.has(via.fromId) || !nodeSet.has(via.toId)) continue;
    edges.push({ ...via });
  }

  const edgesUniq = uniqEdges(edges);
  const trimmedEdges = edgesUniq.length > MINI_GRAPH_MAX_EDGES;
  const edgesKept = edgesUniq.slice(0, MINI_GRAPH_MAX_EDGES);

  // Compute ordering per level.
  const byLevel = new Map<number, string[]>();
  for (const n of kept) {
    const level = n.distance;
    const arr = byLevel.get(level) ?? [];
    arr.push(n.id);
    byLevel.set(level, arr);
  }

  const nodes: MiniGraphNode[] = [];
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
  // Assign level by latest position in any path.
  //
  // When showing multiple paths, a node may appear at different positions.
  // Using the latest position tends to make the mini graph look more intuitive
  // (shared nodes "converge" to the right rather than being pulled left by a
  // single shorter path).
  let best: number | undefined;
  for (const p of paths.paths) {
    const idx = p.elementIds.indexOf(nodeId);
    if (idx < 0) continue;
    if (best === undefined || idx > best) best = idx;
  }
  return best ?? 0;
}

function graphFromPaths(res: PathsBetweenResult, labelForId: (id: string) => string): MiniGraphData {
  const nodeSet = new Set<string>();
  const edges: MiniGraphEdge[] = [];

  // Collect union of path nodes/edges.
  for (const p of res.paths) {
    for (const id of p.elementIds) nodeSet.add(id);
    for (const s of p.steps) edges.push(s);
  }

  // Cap nodes (prefer nearer to source by computed level).
  const nodeList = Array.from(nodeSet);
  nodeList.sort(
    (a, b) =>
      levelForPathsNode(res, a) - levelForPathsNode(res, b) ||
      stableName(labelForId, a).localeCompare(stableName(labelForId, b))
  );
  const trimmedNodes = nodeList.length > MINI_GRAPH_MAX_NODES;
  const keptNodes = nodeList.slice(0, MINI_GRAPH_MAX_NODES);
  const keptSet = new Set<string>(keptNodes);

  const edgesUniq = uniqEdges(edges).filter((e) => keptSet.has(e.fromId) && keptSet.has(e.toId));
  const trimmedEdges = edgesUniq.length > MINI_GRAPH_MAX_EDGES;
  const edgesKept = edgesUniq.slice(0, MINI_GRAPH_MAX_EDGES);

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

  const nodes: MiniGraphNode[] = [];
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

export function buildMiniGraphData(
  labelForId: (id: string) => string,
  mode: MiniGraphMode,
  relatedResult: RelatedElementsResult | null,
  pathsResult: PathsBetweenResult | null
): MiniGraphData | null {
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
