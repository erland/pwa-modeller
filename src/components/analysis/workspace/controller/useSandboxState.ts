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
};

const DEFAULT_SEED_POS = { x: 260, y: 180 };

// Simple layout for batches of added nodes.
const GRID_X = 220;
const GRID_Y = 92;
const GRID_COLS = 4;

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

  // Reset when switching to another model to avoid stale element ids.
  useEffect(() => {
    setNodes([]);
    setShowRelationships(true);
    setRelationshipMode('all');
    setEnabledRelationshipTypes([]);
  }, [modelId]);

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

  const state: SandboxState = useMemo(
    () => ({
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
      },
    }),
    [enabledRelationshipTypes, nodes, relationshipMode, showRelationships]
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
    }),
    [addIfMissing, addManyIfMissing, clear, removeMany, setNodePosition, toggleEnabledRelationshipType]
  );

  return { state, actions } as const;
}
