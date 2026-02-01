import type { Model } from '../types';

/**
 * Direction used when traversing a graph derived from model relationships.
 *
 * - 'outgoing': follow source -> target
 * - 'incoming': follow target -> source
 * - 'both': follow both directions
 */
export type SandboxGraphDirection = 'both' | 'outgoing' | 'incoming';

export type Adjacency = {
  out: Map<string, { to: string; type: string }[]>;
  in: Map<string, { to: string; type: string }[]>;
};

export function buildAdjacency(model: Model, allowedTypes: Set<string>): Adjacency {
  const out = new Map<string, { to: string; type: string }[]>();
  const _in = new Map<string, { to: string; type: string }[]>();

  for (const r of Object.values(model.relationships)) {
    const s = r.sourceElementId;
    const t = r.targetElementId;
    if (!s || !t) continue;
    if (!allowedTypes.has(r.type)) continue;

    if (!out.has(s)) out.set(s, []);
    if (!_in.has(t)) _in.set(t, []);
    out.get(s)!.push({ to: t, type: r.type });
    _in.get(t)!.push({ to: s, type: r.type });
  }

  return { out, in: _in };
}

function getNeighbors(args: { adjacency: Adjacency; id: string; direction: SandboxGraphDirection }): string[] {
  const { adjacency, id, direction } = args;
  const out: string[] = [];

  if (direction === 'both' || direction === 'outgoing') {
    for (const e of adjacency.out.get(id) ?? []) out.push(e.to);
  }
  if (direction === 'both' || direction === 'incoming') {
    for (const e of adjacency.in.get(id) ?? []) out.push(e.to);
  }
  return out;
}

export function bfsShortestPath(args: {
  startId: string;
  targetId: string;
  adjacency: Adjacency;
  direction: SandboxGraphDirection;
  maxHops: number;
}): string[] | null {
  const { startId, targetId, adjacency, direction, maxHops } = args;
  if (startId === targetId) return [startId];

  const q: string[] = [startId];
  const parent = new Map<string, string | null>();
  parent.set(startId, null);
  const depth = new Map<string, number>();
  depth.set(startId, 0);

  while (q.length) {
    const cur = q.shift();
    if (!cur) break;
    const d = depth.get(cur) ?? 0;
    if (d >= maxHops) continue;

    for (const nb of getNeighbors({ adjacency, id: cur, direction })) {
      if (parent.has(nb)) continue;
      parent.set(nb, cur);
      depth.set(nb, d + 1);
      if (nb === targetId) {
        q.length = 0;
        break;
      }
      q.push(nb);
    }
  }

  if (!parent.has(targetId)) return null;
  const path: string[] = [];
  let cur: string | null = targetId;
  while (cur) {
    path.push(cur);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return path;
}

export function bfsKShortestPaths(args: {
  startId: string;
  targetId: string;
  adjacency: Adjacency;
  direction: SandboxGraphDirection;
  maxHops: number;
  k: number;
}): string[][] {
  const { startId, targetId, adjacency, direction, maxHops, k } = args;
  if (k <= 0) return [];
  if (startId === targetId) return [[startId]];

  const results: string[][] = [];
  const q: string[][] = [[startId]];

  // Safety caps for worst-case graphs.
  let expansions = 0;
  const MAX_EXPANSIONS = 20000;
  const MAX_QUEUE = 6000;

  while (q.length && results.length < k) {
    const path = q.shift();
    if (!path) break;
    expansions++;
    if (expansions > MAX_EXPANSIONS) break;

    const last = path[path.length - 1];
    const hops = path.length - 1;
    if (hops > maxHops) continue;

    if (last === targetId) {
      results.push(path);
      continue;
    }

    for (const nb of getNeighbors({ adjacency, id: last, direction })) {
      // Avoid cycles by refusing to revisit an id already in the path.
      if (path.includes(nb)) continue;
      q.push([...path, nb]);
      if (q.length > MAX_QUEUE) break;
    }
  }

  return results;
}
