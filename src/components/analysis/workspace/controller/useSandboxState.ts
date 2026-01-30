import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import type { AnalysisMode } from '../../AnalysisQueryPanel';

export type SandboxNode = {
  elementId: string;
  x: number;
  y: number;
  pinned?: boolean;
};

export type SandboxState = {
  nodes: SandboxNode[];
};

export type SandboxActions = {
  setNodePosition: (elementId: string, x: number, y: number) => void;
  addIfMissing: (elementId: string, x?: number, y?: number) => void;
  clear: () => void;
};

const DEFAULT_SEED_POS = { x: 260, y: 180 };

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

/**
 * Owns Analysis Sandbox state.
 *
 * Step 1 scope:
 * - Local nodes with (elementId, x, y, pinned?)
 * - Drag/move support (position updates)
 * - Simple auto-seeding from current selection when entering Sandbox
 */
export function useSandboxState(args: {
  model: Model | null;
  modelId: string;
  mode: AnalysisMode;
  selectionElementIds: string[];
}) {
  const { model, modelId, mode, selectionElementIds } = args;

  const [nodes, setNodes] = useState<SandboxNode[]>([]);

  // Reset when switching to another model to avoid stale element ids.
  useEffect(() => {
    setNodes([]);
  }, [modelId]);

  const addIfMissing = useCallback((elementId: string, x?: number, y?: number) => {
    setNodes((prev) => {
      if (prev.some((n) => n.elementId === elementId)) return prev;
      return uniqByElementId([
        ...prev,
        {
          elementId,
          x: x ?? DEFAULT_SEED_POS.x,
          y: y ?? DEFAULT_SEED_POS.y,
        },
      ]);
    });
  }, []);

  const setNodePosition = useCallback((elementId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.elementId === elementId ? { ...n, x, y } : n))
    );
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

  const state: SandboxState = useMemo(() => ({ nodes }), [nodes]);
  const actions: SandboxActions = useMemo(
    () => ({ setNodePosition, addIfMissing, clear }),
    [addIfMissing, clear, setNodePosition]
  );

  return { state, actions } as const;
}
