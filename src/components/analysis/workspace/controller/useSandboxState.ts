import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import { bfsKShortestPaths, bfsShortestPath, buildAdjacency } from '../../../../domain';
import type { AnalysisMode } from '../../AnalysisQueryPanel';

import type {
  SandboxNode,
  SandboxRelationshipVisibilityMode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesOptions,
  SandboxState,
  SandboxActions
} from './sandboxTypes';
export type {
  SandboxNode,
  SandboxRelationshipVisibilityMode,
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
  SandboxRelationshipsState,
  SandboxUiState,
  SandboxState,
  SandboxActions
} from './sandboxTypes';

import type { PersistedSandboxStateV1 } from './sandboxPersistence';
import {
  clearPersistedSandboxState,
  loadPersistedSandboxState,
  savePersistedSandboxState,
} from './sandboxPersistence';

const DEFAULT_SEED_POS = { x: 260, y: 180 };

// Step 9 caps (polish + safety).
const SANDBOX_MAX_NODES_DEFAULT = 300;
const SANDBOX_MAX_EDGES_DEFAULT = 2000;

// Simple layout for batches of added nodes.
const GRID_X = 220;
const GRID_Y = 92;
const GRID_COLS = 4;

// Must match the rendered node size in SandboxModeView.
const SANDBOX_NODE_W = 180;
const SANDBOX_NODE_H = 56;


const RELATED_RADIUS_STEP = 240;
const RELATED_MIN_SEPARATION = 160;
const RELATED_MAX_ATTEMPTS = 10;

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const iv = Math.round(v);
  if (iv < min) return min;
  if (iv > max) return max;
  return iv;
}

function collectAllRelationshipTypes(model: Model): string[] {
  const set = new Set<string>();
  for (const r of Object.values(model.relationships)) {
    if (!r.type) continue;
    set.add(r.type);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function uniqByElementId(nodes: SandboxNode[]): SandboxNode[] {
  const seen = new Set<string>();
  const out: SandboxNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.elementId)) continue;
    seen.add(n.elementId);
    out.push(n);
  }
  return out;
}

function computeAppendBase(nodes: SandboxNode[]): { x: number; y: number } {
  if (!nodes.length) return DEFAULT_SEED_POS;
  let maxX = nodes[0].x;
  let minY = nodes[0].y;
  for (const n of nodes) {
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
  }
  return { x: maxX + GRID_X, y: minY };
}

function toggleString(values: string[], v: string): string[] {
  const set = new Set(values);
  if (set.has(v)) set.delete(v);
  else set.add(v);
  return Array.from(set);
}

function uniqSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((x) => typeof x === 'string' && x.length > 0))).sort((a, b) => a.localeCompare(b));
}


function applyNodeCap(args: {
  prev: SandboxNode[];
  toAdd: SandboxNode[];
  maxNodes: number;
}): { next: SandboxNode[]; dropped: number } {
  const { prev, toAdd, maxNodes } = args;
  const merged = uniqByElementId([...prev, ...toAdd]);
  if (merged.length <= maxNodes) return { next: merged, dropped: 0 };
  const next = merged.slice(0, maxNodes);
  return { next, dropped: merged.length - next.length };
}

/**
 * Owns Analysis Sandbox state.
 *
 * Step 1 scope:
 * - Local nodes with (elementId, x, y, pinned?)
 * - Drag/move support (position updates)
 * - Simple auto-seeding from current selection when entering Sandbox
 *
 * Step 2 scope:
 * - Add/remove/clear actions
 * - Accept element drops from the navigator
 *
 * Step 3 scope:
 * - Relationship visibility controls (hide/show + filter by relationship type)
 */
export function useSandboxState(args: {
  model: Model | null;
  modelId: string;
  mode: AnalysisMode;
  selectionElementIds: string[];
}) {
  const { model, modelId, mode, selectionElementIds } = args;

  const maxNodes = SANDBOX_MAX_NODES_DEFAULT;
  const maxEdges = SANDBOX_MAX_EDGES_DEFAULT;

  const [nodes, setNodes] = useState<SandboxNode[]>([]);
  const [showRelationships, setShowRelationships] = useState(true);
  const [relationshipMode, setRelationshipMode] = useState<SandboxRelationshipVisibilityMode>('all');
  const [enabledRelationshipTypes, setEnabledRelationshipTypes] = useState<string[]>([]);
  const [explicitRelationshipIds, setExplicitRelationshipIds] = useState<string[]>([]);

  const [warning, setWarning] = useState<string | null>(null);
  const [persistEnabled, setPersistEnabled] = useState(false);
  const [edgeRouting, setEdgeRouting] = useState<'straight' | 'orthogonal'>('straight');
  const [lastInsertedElementIds, setLastInsertedElementIds] = useState<string[]>([]);

  const [addRelatedDepth, setAddRelatedDepth] = useState(1);
  const [addRelatedDirection, setAddRelatedDirection] = useState<SandboxAddRelatedDirection>('both');
  const [addRelatedEnabledTypes, setAddRelatedEnabledTypes] = useState<string[]>([]);

  // Reset when switching to another model to avoid stale element ids.
  useEffect(() => {
    setNodes([]);
    setShowRelationships(true);
    setRelationshipMode('all');
    setEnabledRelationshipTypes([]);
    setExplicitRelationshipIds([]);

    setWarning(null);
    setPersistEnabled(false);
    setEdgeRouting('straight');
    setLastInsertedElementIds([]);

    setAddRelatedDepth(1);
    setAddRelatedDirection('both');
    setAddRelatedEnabledTypes([]);
  }, [modelId]);

  const emitWarning = useCallback((msg: string) => {
    setWarning((prev) => (prev === msg ? prev : msg));
  }, []);

  const clearWarning = useCallback(() => setWarning(null), []);

  const hydrateFromPersisted = useCallback(() => {
    if (!model) return;
    const persisted = loadPersistedSandboxState(modelId);
    if (!persisted) return;

    const nextNodesRaw: SandboxNode[] = persisted.nodes.filter((n) => Boolean(model.elements[n.elementId]));
    const capped = applyNodeCap({ prev: [], toAdd: nextNodesRaw, maxNodes });
    if (capped.dropped > 0) {
      emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
    }

    setNodes(capped.next);
    setLastInsertedElementIds([]);

    setShowRelationships(persisted.relationships.show);
    setRelationshipMode(persisted.relationships.mode ?? 'all');
    setEnabledRelationshipTypes(uniqSortedStrings(persisted.relationships.enabledTypes));
    setExplicitRelationshipIds(uniqSortedStrings(persisted.relationships.explicitIds));

    setAddRelatedDepth(clampInt(persisted.addRelated.depth, 1, 6));
    setAddRelatedDirection(persisted.addRelated.direction ?? 'both');
    setAddRelatedEnabledTypes(uniqSortedStrings(persisted.addRelated.enabledTypes));

    setEdgeRouting(persisted.ui.edgeRouting === 'orthogonal' ? 'orthogonal' : 'straight');
  }, [emitWarning, model, modelId, maxNodes]);


  // Persist sandbox state to sessionStorage if enabled.
  useEffect(() => {
    if (!persistEnabled) return;
    if (!model) return;

    const payload: PersistedSandboxStateV1 = {
      v: 1,
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
        explicitIds: explicitRelationshipIds,
      },
      addRelated: {
        depth: addRelatedDepth,
        direction: addRelatedDirection,
        enabledTypes: addRelatedEnabledTypes,
      },
      ui: {
        edgeRouting,
      },
    };

    savePersistedSandboxState(modelId, payload);
  }, [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, edgeRouting, enabledRelationshipTypes, explicitRelationshipIds, model, modelId, nodes, persistEnabled, relationshipMode, showRelationships]);


  const allRelationshipTypesForModel = useMemo(() => {
    if (!model) return [];
    return collectAllRelationshipTypes(model);
  }, [model]);

  // Default add-related type filter to all relationship types for the model.
  useEffect(() => {
    if (mode !== 'sandbox') return;
    if (!model) return;
    if (addRelatedEnabledTypes.length > 0) return;
    if (allRelationshipTypesForModel.length === 0) return;
    setAddRelatedEnabledTypes(allRelationshipTypesForModel);
  }, [addRelatedEnabledTypes.length, allRelationshipTypesForModel, mode, model]);

  const addManyIfMissing = useCallback(
    (elementIds: string[], baseX?: number, baseY?: number) => {
      if (!model) return;
      const valid = elementIds.filter((id) => Boolean(model.elements[id]));
      if (!valid.length) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));
        const toAdd = valid.filter((id) => !existing.has(id));
        if (!toAdd.length) return prev;

        const base =
          typeof baseX === 'number' && typeof baseY === 'number'
            ? { x: baseX, y: baseY }
            : computeAppendBase(prev);

        const newNodes: SandboxNode[] = toAdd.map((elementId, i) => {
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          return {
            elementId,
            x: base.x + col * GRID_X,
            y: base.y + row * GRID_Y,
          };
        });

        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }

        // Record undo info for the most recent insertion.
        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [emitWarning, maxNodes, model]
  );

  const addIfMissing = useCallback(
    (elementId: string, x?: number, y?: number) => {
      addManyIfMissing([elementId], x, y);
    },
    [addManyIfMissing]
  );

  const setNodePosition = useCallback((elementId: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.elementId === elementId ? { ...n, x, y } : n)));
  }, []);

  const removeMany = useCallback((elementIds: string[]) => {
    if (!elementIds.length) return;
    const remove = new Set(elementIds);
    setNodes((prev) => prev.filter((n) => !remove.has(n.elementId)));
    setLastInsertedElementIds([]);
  }, []);

  const clear = useCallback(() => {
    setNodes([]);
    setWarning(null);
    setLastInsertedElementIds([]);
  }, []);

  const undoLastInsert = useCallback(() => {
    if (lastInsertedElementIds.length === 0) return;
    const remove = new Set(lastInsertedElementIds);
    setNodes((prev) => prev.filter((n) => !remove.has(n.elementId)));
    setLastInsertedElementIds([]);
  }, [lastInsertedElementIds]);

  const setPersistEnabledSafe = useCallback(
    (enabled: boolean) => {
      setPersistEnabled(enabled);
      if (!enabled) {
        clearPersistedSandboxState(modelId);
        return;
      }
      // Only hydrate if the current sandbox is empty, to avoid surprising overwrites.
      if (nodes.length === 0) {
        hydrateFromPersisted();
      }
    },
    [hydrateFromPersisted, modelId, nodes.length]
  );

  // Auto-seed from selection when entering Sandbox and it is empty.
  useEffect(() => {
    if (mode !== 'sandbox') return;
    if (!model) return;
    if (nodes.length) return;
    const first = selectionElementIds[0];
    if (!first) return;
    if (!model.elements[first]) return;
    addIfMissing(first);
  }, [addIfMissing, model, mode, nodes.length, selectionElementIds]);

  const toggleEnabledRelationshipType = useCallback((type: string) => {
    setEnabledRelationshipTypes((prev) => toggleString(prev, type).sort((a, b) => a.localeCompare(b)));
  }, []);

  const setAddRelatedDepthSafe = useCallback((depth: number) => {
    setAddRelatedDepth(clampInt(depth, 1, 6));
  }, []);

  const setAddRelatedEnabledTypesSafe = useCallback((types: string[]) => {
    const uniq = Array.from(new Set(types));
    setAddRelatedEnabledTypes(uniq.sort((a, b) => a.localeCompare(b)));
  }, []);

  const toggleAddRelatedEnabledType = useCallback((type: string) => {
    setAddRelatedEnabledTypes((prev) => toggleString(prev, type).sort((a, b) => a.localeCompare(b)));
  }, []);

  const addRelatedFromSelection = useCallback(
    (anchorElementIds: string[], allowedElementIds?: string[]) => {
      if (!model) return;
      const allowedTypes = new Set(addRelatedEnabledTypes);
      if (allowedTypes.size === 0) return;

      const adjacency = buildAdjacency(model, allowedTypes);
      const depthLimit = clampInt(addRelatedDepth, 1, 6);

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));
        const existingById = new Map<string, SandboxNode>();
        for (const n of prev) existingById.set(n.elementId, n);

        const anchors = anchorElementIds.filter((id) => existingById.has(id));
        if (anchors.length === 0) return prev;

        const alreadyPresent = new Set<string>(existingById.keys());
        const globallyAdded = new Set<string>();
        const newNodes: SandboxNode[] = [];

        const occupiedCenters: { x: number; y: number }[] = prev.map((n) => ({
          x: n.x + SANDBOX_NODE_W / 2,
          y: n.y + SANDBOX_NODE_H / 2,
        }));

        const placeAroundAnchor = (args: {
          anchorIndex: number;
          anchorId: string;
          anchorCenter: { x: number; y: number };
          elementIds: string[];
        }): void => {
          const { anchorIndex, anchorCenter, elementIds } = args;
          if (elementIds.length === 0) return;

          // Distribute in rings around the anchor.
          const ringSize = 12;
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

              const tooClose = occupiedCenters.some((c) => dist2(c, center) < RELATED_MIN_SEPARATION * RELATED_MIN_SEPARATION);
              if (!tooClose) {
                occupiedCenters.push(center);
                newNodes.push({
                  elementId,
                  x: cx - SANDBOX_NODE_W / 2,
                  y: cy - SANDBOX_NODE_H / 2,
                });
                placed = true;
                break;
              }

              attempt++;
              angle = baseAngle + attempt * 0.35;
              r = radius + attempt * 26;
            }
          }
        };

        for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
          const anchorId = anchors[aIdx];
          const anchorNode = existingById.get(anchorId);
          if (!anchorNode) continue;

          const anchorCenter = {
            x: anchorNode.x + SANDBOX_NODE_W / 2,
            y: anchorNode.y + SANDBOX_NODE_H / 2,
          };

          if (allowedElementIds && allowedElementIds.length > 0) {
            // Caller-supplied set (preview dialog). Place around anchors, respecting global uniqueness.
            const toPlace = allowedElementIds
              .filter((id) => Boolean(model.elements[id]))
              .filter((id) => !alreadyPresent.has(id) && !globallyAdded.has(id));
            for (const id of toPlace) globallyAdded.add(id);

            // Distribute between anchors round-robin by letting each anchor place its slice.
            const slice = toPlace.filter((_, idx) => idx % anchors.length === aIdx);
            placeAroundAnchor({ anchorIndex: aIdx, anchorId, anchorCenter, elementIds: slice });
          } else {
            // Traverse from the anchor according to the current settings.
            const visited = new Set<string>([anchorId]);
            const byDepth = new Map<number, string[]>();
            const q: Array<{ id: string; depth: number }> = [{ id: anchorId, depth: 0 }];

            while (q.length) {
              const cur = q.shift();
              if (!cur) break;
              if (cur.depth >= depthLimit) continue;

              const neighbors: string[] = [];
              if (addRelatedDirection === 'both' || addRelatedDirection === 'outgoing') {
                for (const e of adjacency.out.get(cur.id) ?? []) neighbors.push(e.to);
              }
              if (addRelatedDirection === 'both' || addRelatedDirection === 'incoming') {
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
              placeAroundAnchor({ anchorIndex: aIdx, anchorId, anchorCenter, elementIds: toPlace });
            }
          }
        }

        if (newNodes.length === 0) return prev;
        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }
        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        // Track last insert batch for one-click undo.
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, emitWarning, maxNodes, model]
  );

  const insertIntermediatesBetween = useCallback(
    (sourceElementId: string, targetElementId: string, options: SandboxInsertIntermediatesOptions) => {
      if (!model) return;
      if (!sourceElementId || !targetElementId) return;
      if (sourceElementId === targetElementId) return;

      const allowedTypes = new Set(addRelatedEnabledTypes);
      if (allowedTypes.size === 0) return;

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

      if (paths.length === 0) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));
        const existingById = new Map<string, SandboxNode>();
        for (const n of prev) existingById.set(n.elementId, n);

        const startNode = existingById.get(sourceElementId);
        const endNode = existingById.get(targetElementId);
        if (!startNode || !endNode) return prev;

        const sx = startNode.x + SANDBOX_NODE_W / 2;
        const sy = startNode.y + SANDBOX_NODE_H / 2;
        const tx = endNode.x + SANDBOX_NODE_W / 2;
        const ty = endNode.y + SANDBOX_NODE_H / 2;

        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;

        const added = new Set(existingById.keys());
        const positioned = new Map<string, { x: number; y: number }>();

        for (let pIdx = 0; pIdx < paths.length; pIdx++) {
          const path = paths[pIdx];
          if (path.length < 3) continue;
          const intermediates = path.slice(1, -1).filter((id) => Boolean(model.elements[id]));
          const m = intermediates.length;
          if (m === 0) continue;
          const offset = (pIdx - (paths.length - 1) / 2) * 84;
          for (let i = 0; i < m; i++) {
            const elementId = intermediates[i];
            if (allowedElementIdSet && !allowedElementIdSet.has(elementId)) continue;
            if (added.has(elementId)) continue;
            if (positioned.has(elementId)) continue;
            const t = (i + 1) / (m + 1);
            const cx = sx + ux * (len * t) + px * offset;
            const cy = sy + uy * (len * t) + py * offset;
            positioned.set(elementId, { x: cx - SANDBOX_NODE_W / 2, y: cy - SANDBOX_NODE_H / 2 });
          }
        }

        if (positioned.size === 0) return prev;
        const newNodes: SandboxNode[] = [];
        for (const [elementId, pos] of positioned.entries()) {
          newNodes.push({ elementId, x: pos.x, y: pos.y });
        }
        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }
        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        // Track last insert batch for one-click undo.
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [addRelatedEnabledTypes, emitWarning, maxNodes, model]
  );

  
  const seedFromElements = useCallback(
    (args: {
      elementIds: string[];
      relationshipIds?: string[];
      relationshipTypes?: string[];
      layout?: {
        mode: 'grid' | 'distance' | 'levels';
        levelById?: Record<string, number>;
        orderById?: Record<string, number>;
      };
    }) => {
      if (!model) return;

      const inputIds = args.elementIds ?? [];
      const validIds = inputIds.filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
      const uniqIds = uniqByElementId(validIds.map((id) => ({ elementId: id, x: 0, y: 0 }))).map((n) => n.elementId);
      if (uniqIds.length === 0) return;

      const mode = args.layout?.mode ?? 'grid';
      const levelById = args.layout?.levelById ?? {};
      const orderById = args.layout?.orderById ?? {};

      const MARGIN_X = 120;
      const MARGIN_Y = 120;

      const nextNodes: SandboxNode[] = [];

      if (mode === 'distance') {
        const groups = new Map<number, string[]>();
        for (const id of uniqIds) {
          const raw = (levelById as Record<string, number>)[id];
          const lvl = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
          if (!groups.has(lvl)) groups.set(lvl, []);
          groups.get(lvl)!.push(id);
        }
        const levels = Array.from(groups.keys()).sort((a, b) => a - b);
        for (const lvl of levels) {
          const ids = (groups.get(lvl) ?? []).slice().sort((a, b) => a.localeCompare(b));
          for (let i = 0; i < ids.length; i++) {
            nextNodes.push({
              elementId: ids[i],
              x: MARGIN_X + lvl * GRID_X,
              y: MARGIN_Y + i * GRID_Y,
            });
          }
        }
      } else if (mode === 'levels') {
        const entries = uniqIds.map((id) => {
          const rawL = (levelById as Record<string, number>)[id];
          const rawO = (orderById as Record<string, number>)[id];
          const lvl = Number.isFinite(rawL) ? Math.max(0, Math.round(rawL)) : 0;
          const ord = Number.isFinite(rawO) ? Math.max(0, Math.round(rawO)) : 0;
          return { id, lvl, ord };
        });
        entries.sort((a, b) => a.lvl - b.lvl || a.ord - b.ord || a.id.localeCompare(b.id));
        for (const e of entries) {
          nextNodes.push({
            elementId: e.id,
            x: MARGIN_X + e.lvl * GRID_X,
            y: MARGIN_Y + e.ord * GRID_Y,
          });
        }
      } else {
        for (let i = 0; i < uniqIds.length; i++) {
          const id = uniqIds[i];
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          nextNodes.push({
            elementId: id,
            x: MARGIN_X + col * GRID_X,
            y: MARGIN_Y + row * GRID_Y,
          });
        }
      }

      const capped = applyNodeCap({ prev: [], toAdd: nextNodes, maxNodes });
      if (capped.dropped > 0) {
        emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
      }
      setNodes(capped.next);

      // Seed relationship visibility to match the source context.
      setShowRelationships(true);

      const relationshipIds = args.relationshipIds ? uniqSortedStrings(args.relationshipIds) : [];
      const relationshipTypes = args.relationshipTypes ? uniqSortedStrings(args.relationshipTypes) : [];

      if (relationshipIds.length > 0) {
        const validRelIds = relationshipIds.filter((id) => Boolean((model.relationships as Record<string, any>)[id]));
        setRelationshipMode('explicit');
        setExplicitRelationshipIds(validRelIds);
        // Keep type filter as-is (not used in explicit mode).
      } else if (relationshipTypes.length > 0) {
        setRelationshipMode('types');
        setEnabledRelationshipTypes(relationshipTypes);
        setExplicitRelationshipIds([]);
      } else {
        setRelationshipMode('all');
        setEnabledRelationshipTypes([]);
        setExplicitRelationshipIds([]);
      }
    },
    [emitWarning, maxNodes, model]
  );

const seedFromView = useCallback((viewId: string) => {
    if (!model) return;
    const v = model.views?.[viewId];
    const layoutNodes = v?.layout?.nodes ?? [];
    const elementNodes = layoutNodes.filter((n) => Boolean(n.elementId)) as Array<{ elementId: string; x: number; y: number; locked?: boolean }>;
    if (elementNodes.length === 0) return;

    // Keep relative positions from the diagram, but normalize so the top-left starts near a margin.
    let minX = Infinity;
    let minY = Infinity;
    for (const n of elementNodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
    }
    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(minY)) minY = 0;

    const MARGIN_X = 120;
    const MARGIN_Y = 120;

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
        x: (n.x - minX) + MARGIN_X,
        y: (n.y - minY) + MARGIN_Y,
        pinned: Boolean(n.locked),
      });
    }

    if (next.length === 0) return;
    const capped = applyNodeCap({ prev: [], toAdd: next, maxNodes });
    if (capped.dropped > 0) {
      emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
    }
    setNodes(capped.next);
    setLastInsertedElementIds([]);
  }, [emitWarning, maxNodes, model]);

  const autoLayout = useCallback(() => {
    if (!model) return;
    setNodes((prev) => {
      if (prev.length === 0) return prev;

      const ids = prev.map((n) => n.elementId);
      const idSet = new Set(ids);

      const isEdgeAllowed = (r: any): boolean => {
        if (!showRelationships) return false;
        if (!r || !r.id || !r.type) return false;
        if (!r.sourceElementId || !r.targetElementId) return false;
        if (!idSet.has(r.sourceElementId) || !idSet.has(r.targetElementId)) return false;
        if (relationshipMode === 'all') return true;
        if (relationshipMode === 'types') return enabledRelationshipTypes.includes(r.type);
        // explicit
        return explicitRelationshipIds.includes(r.id);
      };

      const adj = new Map<string, string[]>();
      for (const id of ids) adj.set(id, []);
      for (const r of Object.values(model.relationships)) {
        if (!isEdgeAllowed(r)) continue;
        const s = (r as any).sourceElementId as string;
        const t = (r as any).targetElementId as string;
        adj.get(s)?.push(t);
        adj.get(t)?.push(s);
      }

      const nameOf = (id: string): string => {
        const el = model.elements[id] as any;
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

        // For isolated nodes (no edges), ensure they still exist in this component.
        for (const id of visited) {
          // already in some level
          void id;
        }
        components.push({ levels });
      }

      // Layout: stack components vertically to avoid overlap.
      const MARGIN_X = 120;
      let baseY = 120;
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
              x: MARGIN_X + lvl * GRID_X,
              y: baseY + i * GRID_Y,
            });
          }
        }
        baseY += maxRows * GRID_Y + 200;
      }

      // Any ids not placed (e.g. because relationships were hidden) -> grid fallback.
      const notPlaced = ids.filter((id) => !pos.has(id));
      for (let i = 0; i < notPlaced.length; i++) {
        const id = notPlaced[i];
        const col = i % GRID_COLS;
        const row = Math.floor(i / GRID_COLS);
        pos.set(id, { x: MARGIN_X + col * GRID_X, y: 120 + row * GRID_Y });
      }

      const pinnedById = new Map<string, { x: number; y: number }>();
      for (const n of prev) {
        if (n.pinned) pinnedById.set(n.elementId, { x: n.x, y: n.y });
      }

      return prev.map((n) => {
        const pinned = pinnedById.get(n.elementId);
        if (pinned) return { ...n, x: pinned.x, y: pinned.y };
        const p = pos.get(n.elementId);
        if (!p) return n;
        return { ...n, x: p.x, y: p.y };
      });
    });
  }, [enabledRelationshipTypes, explicitRelationshipIds, model, relationshipMode, showRelationships]);

  const state: SandboxState = useMemo(
    () => ({
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
        explicitIds: explicitRelationshipIds,
      },
      addRelated: {
        depth: addRelatedDepth,
        direction: addRelatedDirection,
        enabledTypes: addRelatedEnabledTypes,
      },
      ui: {
        warning,
        maxNodes,
        maxEdges,
        persistEnabled,
        edgeRouting,
        lastInsertedElementIds,
      },
    }),
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, edgeRouting, enabledRelationshipTypes, explicitRelationshipIds, lastInsertedElementIds, maxEdges, maxNodes, nodes, persistEnabled, relationshipMode, showRelationships, warning]
  );

  const actions: SandboxActions = useMemo(
    () => ({
      setNodePosition,
      addIfMissing,
      addManyIfMissing,
      removeMany,
      clear,
      undoLastInsert,
      seedFromView,

      autoLayout,
      setPersistEnabled: setPersistEnabledSafe,
      setEdgeRouting,
      clearWarning,

      seedFromElements,
      setShowRelationships,
      setRelationshipMode,
      setEnabledRelationshipTypes,
      setExplicitRelationshipIds,
      toggleEnabledRelationshipType,

      setAddRelatedDepth: setAddRelatedDepthSafe,
      setAddRelatedDirection,
      setAddRelatedEnabledTypes: setAddRelatedEnabledTypesSafe,
      toggleAddRelatedEnabledType,
      addRelatedFromSelection,

      insertIntermediatesBetween,
    }),
    [
      addIfMissing,
      addManyIfMissing,
      addRelatedFromSelection,
      autoLayout,
      clear,
      undoLastInsert,
      clearWarning,
      seedFromView,
      seedFromElements,
      removeMany,
      setPersistEnabledSafe,
      setEdgeRouting,
      setAddRelatedDepthSafe,
      setAddRelatedEnabledTypesSafe,
      setNodePosition,
      toggleAddRelatedEnabledType,
      toggleEnabledRelationshipType,

      insertIntermediatesBetween,
    ]
  );

  return { state, actions } as const;
}
