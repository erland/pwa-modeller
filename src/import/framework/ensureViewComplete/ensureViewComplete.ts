import type { IRElement, IRViewConnection, IRViewNode } from '../ir';
import type { EnsureViewCompleteConfig, EnsureViewCompleteContext, Rect } from './types';
import { centerOf, keyFor, rectContains, smallestContaining } from './geometry';

function boundsOrDefault(n: IRViewNode, elementById: Map<string, IRElement>, config: EnsureViewCompleteConfig): Rect | undefined {
  if (n.bounds) return n.bounds;
  if (n.kind !== 'element' || !n.elementId) return undefined;
  const t = elementById.get(n.elementId)?.type;
  const s = config.defaultSizeForType(t);
  return { x: 0, y: 0, width: s.width, height: s.height };
}

function computeGlobalRect(nodes: IRViewNode[]): Rect {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let seen = false;
  for (const n of nodes) {
    const b = n.bounds;
    if (!b) continue;
    seen = true;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!seen) return { x: 0, y: 0, width: 1600, height: 900 };
  return {
    x: minX,
    y: minY,
    width: Math.max(800, maxX - minX + 400),
    height: Math.max(600, maxY - minY + 300)
  };
}

function buildNeighbors(relationships: { sourceId: string; targetId: string }[]): Map<string, Set<string>> {
  const neighborsByElementId = new Map<string, Set<string>>();
  const addNeighbor = (a: string, b: string) => {
    if (!neighborsByElementId.has(a)) neighborsByElementId.set(a, new Set<string>());
    neighborsByElementId.get(a)!.add(b);
  };
  for (const r of relationships) {
    addNeighbor(r.sourceId, r.targetId);
    addNeighbor(r.targetId, r.sourceId);
  }
  return neighborsByElementId;
}

function collectContainers(
  nodes: IRViewNode[],
  elementById: Map<string, IRElement>,
  isContainerType: (t: string | undefined) => boolean,
  containerPriority: (t: string | undefined) => number
): {
  containerRects: { id: string; rect: Rect; prio: number }[];
  containerRectById: Map<string, Rect>;
} {
  const containerRects: { id: string; rect: Rect; prio: number }[] = [];
  const containerRectById = new Map<string, Rect>();
  for (const n of nodes) {
    if (n.kind !== 'element' || !n.elementId) continue;
    const b = n.bounds;
    if (!b) continue;
    const t = elementById.get(n.elementId)?.type;
    if (!isContainerType(t)) continue;
    const prio = containerPriority(t);
    containerRects.push({ id: n.elementId, rect: b, prio });
    containerRectById.set(n.elementId, b);
  }

  containerRects.sort((a, b) => {
    // Lower priority number means "more preferred".
    if (a.prio !== b.prio) return a.prio - b.prio;
    return (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x) || a.id.localeCompare(b.id);
  });

  return { containerRects, containerRectById };
}

function inferContainerPopulation(
  nodes: IRViewNode[],
  elementById: Map<string, IRElement>,
  config: EnsureViewCompleteConfig,
  isContainerType: (t: string | undefined) => boolean,
  containerRects: { id: string; rect: Rect; prio: number }[]
): {
  containerKeyByElementId: Map<string, string>;
  containerRectByKey: Map<string, Rect>;
  containerPopulation: Map<string, number>;
} {
  const containerKeyByElementId = new Map<string, string>();
  const containerRectByKey = new Map<string, Rect>();
  const containerPopulation = new Map<string, number>();

  for (const n of nodes) {
    if (n.kind !== 'element' || !n.elementId) continue;
    const t = elementById.get(n.elementId)?.type;
    if (isContainerType(t)) continue;
    const b = boundsOrDefault(n, elementById, config);
    if (!b) continue;
    const container = smallestContaining(containerRects, b);
    if (!container) continue;
    const k = keyFor(container);
    containerKeyByElementId.set(n.elementId, k);
    containerRectByKey.set(k, container);
    containerPopulation.set(k, (containerPopulation.get(k) ?? 0) + 1);
  }

  return { containerKeyByElementId, containerRectByKey, containerPopulation };
}

function computeStartForContainer(
  nodes: IRViewNode[],
  container: Rect,
  elementById: Map<string, IRElement>,
  isContainerType: (t: string | undefined) => boolean
): { x: number; y: number } {
  const padX = 80;
  const padY = 60;
  let maxY = container.y + padY;
  for (const n of nodes) {
    if (n.kind !== 'element' || !n.elementId) continue;
    const t = elementById.get(n.elementId)?.type;
    if (isContainerType(t)) continue;
    const b = n.bounds;
    if (!b) continue;
    if (!rectContains(container, b)) continue;
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: container.x + padX, y: maxY + 40 };
}

/**
 * Best-effort "complete" a diagram view: ensure all visual elements have nodes, and optionally add missing connections.
 *
 * This is primarily intended for importers where DI/layout information is partial (common in many formats).
 * It is configurable so notation-specific heuristics (containers, semantic containment, default sizes) can be plugged in.
 */
export function ensureViewComplete(
  nodes: IRViewNode[],
  connections: IRViewConnection[],
  ctx: EnsureViewCompleteContext,
  config: EnsureViewCompleteConfig
): void {
  const { elements, relationships, elementById } = ctx;

  const autoIdPrefix = config.autoIdPrefix ?? 'auto:';
  const isContainerType = config.isContainerElementType ?? (() => false);
  const containerPriority = config.containerPriority ?? (() => 0);
  const skipAutoplaceContainers = config.skipAutoplaceContainers ?? true;
  const enableNeighborVoting = config.enableNeighborVoting ?? true;
  const enableAutoConnections = config.enableAutoConnections ?? true;
  const preferredContainerIdByElementId = config.preferredContainerIdByElementId;

  const existingElementNodeIds = new Set<string>();
  for (const n of nodes) {
    if (n.kind === 'element' && n.elementId) existingElementNodeIds.add(n.elementId);
  }

  // Collect DI containers from existing nodes.
  const { containerRects, containerRectById } = collectContainers(nodes, elementById, isContainerType, containerPriority);
  const globalRect = computeGlobalRect(nodes);

  // Map already-placed elements to their containing container (based on DI bounds).
  const { containerKeyByElementId, containerRectByKey, containerPopulation } = inferContainerPopulation(
    nodes,
    elementById,
    config,
    isContainerType,
    containerRects
  );

  // Build quick adjacency map from the model graph (relationships).
  const neighborsByElementId = buildNeighbors(relationships);

  const pickContainerFor = (elId: string): Rect => {
    // 1) Preferred semantic container, if present and has DI bounds.
    const preferredContainerId = preferredContainerIdByElementId?.get(elId);
    if (preferredContainerId) {
      const r = containerRectById.get(preferredContainerId);
      if (r) return r;
    }

    // 2) Infer container from connected elements.
    if (enableNeighborVoting) {
      const neighbors = neighborsByElementId.get(elId);
      if (neighbors && neighbors.size > 0) {
        const votes = new Map<string, number>();
        for (const nb of neighbors) {
          const ck = containerKeyByElementId.get(nb);
          if (!ck) continue;
          votes.set(ck, (votes.get(ck) ?? 0) + 1);
        }
        if (votes.size > 0) {
          const bestKey = [...votes.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
          const rect = containerRectByKey.get(bestKey);
          if (rect) return rect;
        }
      }
    }

    // 3) Most populated container.
    if (containerPopulation.size > 0) {
      const bestKey = [...containerPopulation.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
      const rect = containerRectByKey.get(bestKey);
      if (rect) return rect;
    }

    // 4) First container, otherwise global.
    if (containerRects.length) return containerRects[0].rect;
    return globalRect;
  };

  const cursorByContainer = new Map<string, { x: number; y: number }>();
  const getCursor = (r: Rect) => {
    const k = keyFor(r);
    let cur = cursorByContainer.get(k);
    if (!cur) {
      cur = computeStartForContainer(nodes, r, elementById, isContainerType);
      cursorByContainer.set(k, cur);
    }
    return cur;
  };

  const pad = { x: 80, y: 60 };
  const gap = { x: 40, y: 40 };

  // 1) Add missing element view nodes.
  for (const e of elements) {
    const t = e.type;
    if (!config.isVisualElementType(t)) continue;
    if (existingElementNodeIds.has(e.id)) continue;
    if (skipAutoplaceContainers && isContainerType(t)) continue;

    const container = pickContainerFor(e.id);
    const cur = getCursor(container);
    const size = config.defaultSizeForType(t);

    const innerW = Math.max(300, container.width - pad.x * 2);
    const maxX = container.x + pad.x + innerW;

    // Wrap when reaching container width.
    if (cur.x + size.width > maxX) {
      cur.x = container.x + pad.x;
      cur.y += size.height + gap.y;
    }

    nodes.push({
      id: `${autoIdPrefix}${e.id}`,
      kind: 'element',
      elementId: e.id,
      bounds: {
        x: cur.x,
        y: cur.y,
        width: size.width,
        height: size.height
      }
    });

    existingElementNodeIds.add(e.id);
    cur.x += size.width + gap.x;
  }

  if (!enableAutoConnections) return;

  // 2) Add missing view connections for relationships where both ends exist in the view.
  const existingRelIds = new Set<string>();
  for (const c of connections) {
    if (c.relationshipId) existingRelIds.add(c.relationshipId);
  }

  // Build quick lookup for node centers.
  const nodeCenterByElementId = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (n.kind !== 'element' || !n.elementId) continue;
    const b = boundsOrDefault(n, elementById, config);
    if (!b) continue;
    nodeCenterByElementId.set(n.elementId, centerOf(b));
  }

  for (const r of relationships) {
    if (existingRelIds.has(r.id)) continue;
    if (!nodeCenterByElementId.has(r.sourceId) || !nodeCenterByElementId.has(r.targetId)) continue;
    const a = nodeCenterByElementId.get(r.sourceId)!;
    const b = nodeCenterByElementId.get(r.targetId)!;
    connections.push({
      id: `${autoIdPrefix}${r.id}`,
      relationshipId: r.id,
      points: [a, b]
    });
    existingRelIds.add(r.id);
  }
}
