import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import type { AnalysisMode } from '../../AnalysisQueryPanel';

export type SandboxNode = {
  elementId: string;
  x: number;
  y: number;
  pinned?: boolean;
};

export type SandboxRelationshipVisibilityMode = 'all' | 'types';

export type SandboxAddRelatedDirection = 'both' | 'outgoing' | 'incoming';

export type SandboxRelationshipsState = {
  show: boolean;
  mode: SandboxRelationshipVisibilityMode;
  /**
   * Enabled relationship type strings when mode === 'types'.
   * When empty, no relationships are shown.
   */
  enabledTypes: string[];
};

export type SandboxState = {
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  addRelated: {
    depth: number;
    direction: SandboxAddRelatedDirection;
    /**
     * Enabled relationship types used for traversal when adding related elements.
     * When empty, no related elements are added.
     */
    enabledTypes: string[];
  };
};

export type SandboxActions = {
  setNodePosition: (elementId: string, x: number, y: number) => void;
  addIfMissing: (elementId: string, x?: number, y?: number) => void;
  addManyIfMissing: (elementIds: string[], baseX?: number, baseY?: number) => void;
  removeMany: (elementIds: string[]) => void;
  clear: () => void;

  setShowRelationships: (show: boolean) => void;
  setRelationshipMode: (mode: SandboxRelationshipVisibilityMode) => void;
  setEnabledRelationshipTypes: (types: string[]) => void;
  toggleEnabledRelationshipType: (type: string) => void;

  setAddRelatedDepth: (depth: number) => void;
  setAddRelatedDirection: (direction: SandboxAddRelatedDirection) => void;
  setAddRelatedEnabledTypes: (types: string[]) => void;
  toggleAddRelatedEnabledType: (type: string) => void;
  addRelatedFromSelection: (anchorElementIds: string[]) => void;
};

const DEFAULT_SEED_POS = { x: 260, y: 180 };

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

type Adjacency = {
  out: Map<string, { to: string; type: string }[]>;
  in: Map<string, { to: string; type: string }[]>;
};

function buildAdjacency(model: Model, allowedTypes: Set<string>): Adjacency {
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

  const [nodes, setNodes] = useState<SandboxNode[]>([]);
  const [showRelationships, setShowRelationships] = useState(true);
  const [relationshipMode, setRelationshipMode] = useState<SandboxRelationshipVisibilityMode>('all');
  const [enabledRelationshipTypes, setEnabledRelationshipTypes] = useState<string[]>([]);

  const [addRelatedDepth, setAddRelatedDepth] = useState(1);
  const [addRelatedDirection, setAddRelatedDirection] = useState<SandboxAddRelatedDirection>('both');
  const [addRelatedEnabledTypes, setAddRelatedEnabledTypes] = useState<string[]>([]);

  // Reset when switching to another model to avoid stale element ids.
  useEffect(() => {
    setNodes([]);
    setShowRelationships(true);
    setRelationshipMode('all');
    setEnabledRelationshipTypes([]);

    setAddRelatedDepth(1);
    setAddRelatedDirection('both');
    setAddRelatedEnabledTypes([]);
  }, [modelId]);

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

        return uniqByElementId([...prev, ...newNodes]);
      });
    },
    [model]
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
  }, []);

  const clear = useCallback(() => setNodes([]), []);

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
    (anchorElementIds: string[]) => {
      if (!model) return;
      const allowedTypes = new Set(addRelatedEnabledTypes);
      if (allowedTypes.size === 0) return;

      const adjacency = buildAdjacency(model, allowedTypes);
      const depthLimit = clampInt(addRelatedDepth, 1, 6);

      setNodes((prev) => {
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

        for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
          const anchorId = anchors[aIdx];
          const anchorNode = existingById.get(anchorId);
          if (!anchorNode) continue;

          const anchorCenter = {
            x: anchorNode.x + SANDBOX_NODE_W / 2,
            y: anchorNode.y + SANDBOX_NODE_H / 2,
          };

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

            const radius = RELATED_RADIUS_STEP * d;
            const angleOffset = (aIdx / Math.max(1, anchors.length)) * Math.PI * 0.4;

            for (let i = 0; i < toPlace.length; i++) {
              const elementId = toPlace[i];
              globallyAdded.add(elementId);

              // Evenly distribute around the anchor.
              const baseAngle = (2 * Math.PI * i) / Math.max(1, toPlace.length) + angleOffset;
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
                // Spiral outward a little and rotate to find a free spot.
                angle = baseAngle + attempt * 0.35;
                r = radius + attempt * 26;
              }
            }
          }
        }

        if (newNodes.length === 0) return prev;
        return uniqByElementId([...prev, ...newNodes]);
      });
    },
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, model]
  );

  const state: SandboxState = useMemo(
    () => ({
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
      },
      addRelated: {
        depth: addRelatedDepth,
        direction: addRelatedDirection,
        enabledTypes: addRelatedEnabledTypes,
      },
    }),
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, enabledRelationshipTypes, nodes, relationshipMode, showRelationships]
  );

  const actions: SandboxActions = useMemo(
    () => ({
      setNodePosition,
      addIfMissing,
      addManyIfMissing,
      removeMany,
      clear,
      setShowRelationships,
      setRelationshipMode,
      setEnabledRelationshipTypes,
      toggleEnabledRelationshipType,

      setAddRelatedDepth: setAddRelatedDepthSafe,
      setAddRelatedDirection,
      setAddRelatedEnabledTypes: setAddRelatedEnabledTypesSafe,
      toggleAddRelatedEnabledType,
      addRelatedFromSelection,
    }),
    [
      addIfMissing,
      addManyIfMissing,
      addRelatedFromSelection,
      clear,
      removeMany,
      setAddRelatedDepthSafe,
      setAddRelatedEnabledTypesSafe,
      setNodePosition,
      toggleAddRelatedEnabledType,
      toggleEnabledRelationshipType,
    ]
  );

  return { state, actions } as const;
}
