import type { Element, Model, Relationship } from '../../../../domain';

import type { SandboxNode, SandboxRelationshipVisibilityMode } from './sandboxTypes';
import type { XY } from './sandboxStateUtils';

import { dist2 } from './sandboxStateUtils';

export function computeAppendBase(args: {
  nodes: SandboxNode[];
  defaultPos: XY;
  gridX: number;
}): XY {
  const { nodes, defaultPos, gridX } = args;
  if (!nodes.length) return defaultPos;
  let maxX = nodes[0].x;
  let minY = nodes[0].y;
  for (const n of nodes) {
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
  }
  return { x: maxX + gridX, y: minY };
}

export function layoutGrid(args: {
  elementIds: string[];
  base: XY;
  gridX: number;
  gridY: number;
  gridCols: number;
}): SandboxNode[] {
  const { elementIds, base, gridX, gridY, gridCols } = args;
  return elementIds.map((elementId, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    return {
      elementId,
      x: base.x + col * gridX,
      y: base.y + row * gridY,
    };
  });
}

export function seedFromViewLayout(args: {
  model: Model;
  viewId: string;
  margin: XY;
}): SandboxNode[] {
  const { model, viewId, margin } = args;
  const v = model.views?.[viewId];
  const layoutNodes = v?.layout?.nodes ?? [];
  const elementNodes = layoutNodes.filter((n) => Boolean((n as { elementId?: string }).elementId)) as Array<{
    elementId: string;
    x: number;
    y: number;
    locked?: boolean;
  }>;
  if (elementNodes.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  for (const n of elementNodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  const next: SandboxNode[] = [];
  const seen = new Set<string>();
  for (const n of elementNodes) {
    const id = n.elementId;
    if (!id) continue;
    if (seen.has(id)) continue;
    if (!model.elements[id]) continue;
    seen.add(id);
    next.push({
      elementId: id,
      x: n.x - minX + margin.x,
      y: n.y - minY + margin.y,
      pinned: Boolean(n.locked),
    });
  }
  return next;
}

export function seedFromElementsLayout(args: {
  elementIds: string[];
  mode: 'grid' | 'distance' | 'levels';
  levelById?: Record<string, number>;
  orderById?: Record<string, number>;
  margin: XY;
  gridX: number;
  gridY: number;
  gridCols: number;
}): SandboxNode[] {
  const { elementIds, mode, levelById = {}, orderById = {}, margin, gridX, gridY, gridCols } = args;

  if (mode === 'distance') {
    const groups = new Map<number, string[]>();
    for (const id of elementIds) {
      const raw = levelById[id];
      const lvl = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
      if (!groups.has(lvl)) groups.set(lvl, []);
      groups.get(lvl)!.push(id);
    }
    const levels = Array.from(groups.keys()).sort((a, b) => a - b);
    const next: SandboxNode[] = [];
    for (const lvl of levels) {
      const ids = (groups.get(lvl) ?? []).slice().sort((a, b) => a.localeCompare(b));
      for (let i = 0; i < ids.length; i++) {
        next.push({
          elementId: ids[i],
          x: margin.x + lvl * gridX,
          y: margin.y + i * gridY,
        });
      }
    }
    return next;
  }

  if (mode === 'levels') {
    const entries = elementIds.map((id) => {
      const rawL = levelById[id];
      const rawO = orderById[id];
      const lvl = Number.isFinite(rawL) ? Math.max(0, Math.round(rawL)) : 0;
      const ord = Number.isFinite(rawO) ? Math.max(0, Math.round(rawO)) : 0;
      return { id, lvl, ord };
    });
    entries.sort((a, b) => a.lvl - b.lvl || a.ord - b.ord || a.id.localeCompare(b.id));
    return entries.map((e) => ({
      elementId: e.id,
      x: margin.x + e.lvl * gridX,
      y: margin.y + e.ord * gridY,
    }));
  }

  // grid
  return elementIds.map((id, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    return {
      elementId: id,
      x: margin.x + col * gridX,
      y: margin.y + row * gridY,
    };
  });
}

export function autoLayoutSandboxNodes(args: {
  model: Model;
  nodes: SandboxNode[];
  showRelationships: boolean;
  relationshipMode: SandboxRelationshipVisibilityMode;
  enabledRelationshipTypes: string[];
  explicitRelationshipIds: string[];
  margin: XY;
  gridX: number;
  gridY: number;
  gridCols: number;
}): SandboxNode[] {
  const {
    model,
    nodes,
    showRelationships,
    relationshipMode,
    enabledRelationshipTypes,
    explicitRelationshipIds,
    margin,
    gridX,
    gridY,
    gridCols,
  } = args;

  if (nodes.length === 0) return nodes;

  const ids = nodes.map((n) => n.elementId);
  const idSet = new Set(ids);

  const isEdgeAllowed = (r: Relationship | undefined): boolean => {
    if (!showRelationships) return false;
    if (!r || !r.id || !r.type) return false;
    if (!r.sourceElementId || !r.targetElementId) return false;
    if (!idSet.has(r.sourceElementId) || !idSet.has(r.targetElementId)) return false;
    if (relationshipMode === 'all') return true;
    if (relationshipMode === 'types') return enabledRelationshipTypes.includes(r.type);
    return explicitRelationshipIds.includes(r.id);
  };

  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const r of Object.values(model.relationships)) {
    if (!isEdgeAllowed(r)) continue;
    const s = r.sourceElementId as string;
    const t = r.targetElementId as string;
    adj.get(s)?.push(t);
    adj.get(t)?.push(s);
  }

  const nameOf = (id: string): string => {
    const el = model.elements[id] as Element | undefined;
    const nm = el?.name;
    return typeof nm === 'string' && nm.length ? nm : id;
  };

  const unvisited = new Set(ids);
  const components: Array<{ levels: Map<number, string[]> }> = [];

  while (unvisited.size) {
    const root = Array.from(unvisited).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))[0];
    if (!root) break;
    unvisited.delete(root);

    const q: Array<{ id: string; lvl: number }> = [{ id: root, lvl: 0 }];
    const visited = new Set<string>([root]);
    const levels = new Map<number, string[]>();
    levels.set(0, [root]);

    while (q.length) {
      const cur = q.shift();
      if (!cur) break;
      const nextLvl = cur.lvl + 1;
      for (const nb of adj.get(cur.id) ?? []) {
        if (visited.has(nb)) continue;
        if (!idSet.has(nb)) continue;
        visited.add(nb);
        unvisited.delete(nb);
        if (!levels.has(nextLvl)) levels.set(nextLvl, []);
        levels.get(nextLvl)!.push(nb);
        q.push({ id: nb, lvl: nextLvl });
      }
    }

    components.push({ levels });
  }

  // Layout: stack components vertically to avoid overlap.
  let baseY = margin.y;
  const pos = new Map<string, { x: number; y: number }>();

  for (const comp of components) {
    const lvlKeys = Array.from(comp.levels.keys()).sort((a, b) => a - b);
    let maxRows = 1;
    for (const lvl of lvlKeys) {
      const arr = comp.levels.get(lvl) ?? [];
      arr.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      maxRows = Math.max(maxRows, arr.length);
      for (let i = 0; i < arr.length; i++) {
        pos.set(arr[i], {
          x: margin.x + lvl * gridX,
          y: baseY + i * gridY,
        });
      }
    }
    baseY += maxRows * gridY + 200;
  }

  // Any ids not placed (e.g. because relationships were hidden) -> grid fallback.
  const notPlaced = ids.filter((id) => !pos.has(id));
  for (let i = 0; i < notPlaced.length; i++) {
    const id = notPlaced[i];
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    pos.set(id, { x: margin.x + col * gridX, y: margin.y + row * gridY });
  }

  const pinnedById = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (n.pinned) pinnedById.set(n.elementId, { x: n.x, y: n.y });
  }

  return nodes.map((n) => {
    const pinned = pinnedById.get(n.elementId);
    if (pinned) return { ...n, x: pinned.x, y: pinned.y };
    const p = pos.get(n.elementId);
    if (!p) return n;
    return { ...n, x: p.x, y: p.y };
  });
}

export function findNonOverlappingCenter(args: {
  occupiedCenters: XY[];
  desired: XY;
  minSeparation: number;
}): boolean {
  const { occupiedCenters, desired, minSeparation } = args;
  const minD2 = minSeparation * minSeparation;
  return !occupiedCenters.some((c) => dist2(c, desired) < minD2);
}
