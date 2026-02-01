import type { Model } from '../../../../domain';
import { bfsKShortestPaths, bfsShortestPath, buildAdjacency } from '../../../../domain';

import type { SandboxAddRelatedDirection, SandboxInsertIntermediatesOptions, SandboxNode } from './sandboxTypes';
import type { XY } from './sandboxStateUtils';

import { clampInt } from './sandboxStateUtils';
import { findNonOverlappingCenter } from './sandboxStateLayout';
import {
  INTERMEDIATE_PATH_OFFSET_STEP,
  RELATED_ANGLE_STEP,
  RELATED_MAX_ATTEMPTS,
  RELATED_MIN_SEPARATION,
  RELATED_RADIUS_JITTER,
  RELATED_RADIUS_STEP,
  RELATED_RING_SIZE,
} from './sandboxStateConstants';

export function computeRelatedNewNodes(args: {
  model: Model;
  existingNodes: SandboxNode[];
  anchorElementIds: string[];
  depth: number;
  direction: SandboxAddRelatedDirection;
  enabledRelationshipTypes: string[];
  allowedElementIds?: string[];
  nodeW: number;
  nodeH: number;
}): SandboxNode[] {
  const {
    model,
    existingNodes,
    anchorElementIds,
    depth,
    direction,
    enabledRelationshipTypes,
    allowedElementIds,
    nodeW,
    nodeH,
  } = args;

  const allowedTypes = new Set(enabledRelationshipTypes);
  if (allowedTypes.size === 0) return [];

  const adjacency = buildAdjacency(model, allowedTypes);
  const depthLimit = clampInt(depth, 1, 6);

  const existingById = new Map<string, SandboxNode>();
  for (const n of existingNodes) existingById.set(n.elementId, n);
  const anchors = anchorElementIds.filter((id) => existingById.has(id));
  if (anchors.length === 0) return [];

  const alreadyPresent = new Set<string>(existingById.keys());
  const globallyAdded = new Set<string>();

  const occupiedCenters: XY[] = existingNodes.map((n) => ({
    x: n.x + nodeW / 2,
    y: n.y + nodeH / 2,
  }));

  const newNodes: SandboxNode[] = [];

  const placeAroundAnchor = (args2: {
    anchorIndex: number;
    anchorCenter: XY;
    elementIds: string[];
  }): void => {
    const { anchorIndex, anchorCenter, elementIds } = args2;
    if (elementIds.length === 0) return;

    const ringSize = RELATED_RING_SIZE;
    const angleOffset = (anchorIndex / Math.max(1, anchors.length)) * Math.PI * 0.4;

    for (let i = 0; i < elementIds.length; i++) {
      const elementId = elementIds[i];

      const ring = Math.floor(i / ringSize) + 1;
      const radius = RELATED_RADIUS_STEP * ring;
      const idxInRing = i % ringSize;
      const denom = Math.min(ringSize, elementIds.length - (ring - 1) * ringSize);
      const baseAngle = (2 * Math.PI * idxInRing) / Math.max(1, denom) + angleOffset;

      let placed = false;
      let attempt = 0;
      let angle = baseAngle;
      let r = radius;

      while (!placed && attempt < RELATED_MAX_ATTEMPTS) {
        const cx = anchorCenter.x + r * Math.cos(angle);
        const cy = anchorCenter.y + r * Math.sin(angle);
        const center = { x: cx, y: cy };

        const ok = findNonOverlappingCenter({
          occupiedCenters,
          desired: center,
          minSeparation: RELATED_MIN_SEPARATION,
        });

        if (ok) {
          occupiedCenters.push(center);
          newNodes.push({
            elementId,
            x: cx - nodeW / 2,
            y: cy - nodeH / 2,
          });
          placed = true;
          break;
        }

        attempt++;
        angle = baseAngle + attempt * RELATED_ANGLE_STEP;
        r = radius + attempt * RELATED_RADIUS_JITTER;
      }
    }
  };

  for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
    const anchorId = anchors[aIdx];
    const anchorNode = existingById.get(anchorId);
    if (!anchorNode) continue;

    const anchorCenter = {
      x: anchorNode.x + nodeW / 2,
      y: anchorNode.y + nodeH / 2,
    };

    if (allowedElementIds && allowedElementIds.length > 0) {
      const toPlace = allowedElementIds
        .filter((id) => Boolean(model.elements[id]))
        .filter((id) => !alreadyPresent.has(id) && !globallyAdded.has(id));
      for (const id of toPlace) globallyAdded.add(id);

      const slice = toPlace.filter((_, idx) => idx % anchors.length === aIdx);
      placeAroundAnchor({ anchorIndex: aIdx, anchorCenter, elementIds: slice });
      continue;
    }

    const visited = new Set<string>([anchorId]);
    const byDepth = new Map<number, string[]>();
    const q: Array<{ id: string; depth: number }> = [{ id: anchorId, depth: 0 }];

    while (q.length) {
      const cur = q.shift();
      if (!cur) break;
      if (cur.depth >= depthLimit) continue;

      const neighbors: string[] = [];
      if (direction === 'both' || direction === 'outgoing') {
        for (const e of adjacency.out.get(cur.id) ?? []) neighbors.push(e.to);
      }
      if (direction === 'both' || direction === 'incoming') {
        for (const e of adjacency.in.get(cur.id) ?? []) neighbors.push(e.to);
      }

      const nextDepth = cur.depth + 1;
      for (const nb of neighbors) {
        if (visited.has(nb)) continue;
        if (!model.elements[nb]) continue;
        visited.add(nb);
        if (!byDepth.has(nextDepth)) byDepth.set(nextDepth, []);
        byDepth.get(nextDepth)!.push(nb);
        q.push({ id: nb, depth: nextDepth });
      }
    }

    for (let d = 1; d <= depthLimit; d++) {
      const raw = byDepth.get(d) ?? [];
      const toPlace = raw.filter((id) => !alreadyPresent.has(id) && !globallyAdded.has(id));
      if (toPlace.length === 0) continue;
      for (const id of toPlace) globallyAdded.add(id);
      placeAroundAnchor({ anchorIndex: aIdx, anchorCenter, elementIds: toPlace });
    }
  }

  return newNodes;
}

export function computeIntermediatesNewNodes(args: {
  model: Model;
  existingNodes: SandboxNode[];
  sourceElementId: string;
  targetElementId: string;
  options: SandboxInsertIntermediatesOptions;
  enabledRelationshipTypes: string[];
  nodeW: number;
  nodeH: number;
}): SandboxNode[] {
  const {
    model,
    existingNodes,
    sourceElementId,
    targetElementId,
    options,
    enabledRelationshipTypes,
    nodeW,
    nodeH,
  } = args;

  if (!sourceElementId || !targetElementId) return [];
  if (sourceElementId === targetElementId) return [];

  const allowedTypes = new Set(enabledRelationshipTypes);
  if (allowedTypes.size === 0) return [];

  const direction = options.direction;
  const maxHops = clampInt(options.maxHops, 1, 16);
  const mode = options.mode;
  const k = clampInt(options.k, 1, 10);
  const allowedElementIdSet = options.allowedElementIds ? new Set(options.allowedElementIds) : null;

  const adjacency = buildAdjacency(model, allowedTypes);

  const paths: string[][] =
    mode === 'topk'
      ? bfsKShortestPaths({ startId: sourceElementId, targetId: targetElementId, adjacency, direction, maxHops, k })
      : (() => {
          const p = bfsShortestPath({ startId: sourceElementId, targetId: targetElementId, adjacency, direction, maxHops });
          return p ? [p] : [];
        })();

  if (paths.length === 0) return [];

  const existingById = new Map<string, SandboxNode>();
  for (const n of existingNodes) existingById.set(n.elementId, n);

  const startNode = existingById.get(sourceElementId);
  const endNode = existingById.get(targetElementId);
  if (!startNode || !endNode) return [];

  const sx = startNode.x + nodeW / 2;
  const sy = startNode.y + nodeH / 2;
  const tx = endNode.x + nodeW / 2;
  const ty = endNode.y + nodeH / 2;

  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const added = new Set(existingById.keys());
  const positioned = new Map<string, XY>();

  for (let pIdx = 0; pIdx < paths.length; pIdx++) {
    const path = paths[pIdx];
    if (path.length < 3) continue;
    const intermediates = path.slice(1, -1).filter((id) => Boolean(model.elements[id]));
    const m = intermediates.length;
    if (m === 0) continue;

    const offset = (pIdx - (paths.length - 1) / 2) * INTERMEDIATE_PATH_OFFSET_STEP;
    for (let i = 0; i < m; i++) {
      const elementId = intermediates[i];
      if (allowedElementIdSet && !allowedElementIdSet.has(elementId)) continue;
      if (added.has(elementId)) continue;
      if (positioned.has(elementId)) continue;
      const t = (i + 1) / (m + 1);
      const cx = sx + ux * (len * t) + px * offset;
      const cy = sy + uy * (len * t) + py * offset;
      positioned.set(elementId, { x: cx - nodeW / 2, y: cy - nodeH / 2 });
    }
  }

  const out: SandboxNode[] = [];
  for (const [elementId, pos] of positioned.entries()) {
    out.push({ elementId, x: pos.x, y: pos.y });
  }
  return out;
}
