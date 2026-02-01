import { useCallback } from 'react';

import type { Model } from '../../../../domain';

import type { SandboxNode } from './sandboxTypes';
import { DEFAULT_SEED_POS, GRID_COLS, GRID_X, GRID_Y } from './sandboxStateConstants';
import { applyNodeCap } from './sandboxStateCaps';
import { computeAppendBase, layoutGrid } from './sandboxStateLayout';

export function useSandboxBasicsActions(args: {
  model: Model | null;
  maxNodes: number;
  emitWarning: (msg: string) => void;
  clearWarning: () => void;

  setNodes: React.Dispatch<React.SetStateAction<SandboxNode[]>>;
  setLastInsertedElementIds: React.Dispatch<React.SetStateAction<string[]>>;
  lastInsertedElementIds: string[];
}) {
  const {
    model,
    maxNodes,
    emitWarning,
    clearWarning,
    setNodes,
    setLastInsertedElementIds,
    lastInsertedElementIds,
  } = args;

  const addManyIfMissing = useCallback(
    (elementIds: string[], baseX?: number, baseY?: number) => {
      if (!model) return;
      const valid = elementIds.filter((id) => Boolean(model.elements[id]));
      if (valid.length === 0) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));
        const toAdd = valid.filter((id) => !existing.has(id));
        if (toAdd.length === 0) return prev;

        const base =
          typeof baseX === 'number' && typeof baseY === 'number'
            ? { x: baseX, y: baseY }
            : computeAppendBase({ nodes: prev, defaultPos: DEFAULT_SEED_POS, gridX: GRID_X });

        const newNodes: SandboxNode[] = layoutGrid({
          elementIds: toAdd,
          base,
          gridX: GRID_X,
          gridY: GRID_Y,
          gridCols: GRID_COLS,
        });

        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }

        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [emitWarning, maxNodes, model, setLastInsertedElementIds, setNodes]
  );

  const addIfMissing = useCallback(
    (elementId: string, x?: number, y?: number) => {
      addManyIfMissing([elementId], x, y);
    },
    [addManyIfMissing]
  );

  const setNodePosition = useCallback(
    (elementId: string, x: number, y: number) => {
      setNodes((prev) => prev.map((n) => (n.elementId === elementId ? { ...n, x, y } : n)));
    },
    [setNodes]
  );

  const removeMany = useCallback(
    (elementIds: string[]) => {
      if (elementIds.length === 0) return;
      const remove = new Set(elementIds);
      setNodes((prev) => prev.filter((n) => !remove.has(n.elementId)));
      setLastInsertedElementIds([]);
    },
    [setLastInsertedElementIds, setNodes]
  );

  const clear = useCallback(() => {
    setNodes([]);
    clearWarning();
    setLastInsertedElementIds([]);
  }, [clearWarning, setLastInsertedElementIds, setNodes]);

  const undoLastInsert = useCallback(() => {
    if (lastInsertedElementIds.length === 0) return;
    const remove = new Set(lastInsertedElementIds);
    setNodes((prev) => prev.filter((n) => !remove.has(n.elementId)));
    setLastInsertedElementIds([]);
  }, [lastInsertedElementIds, setLastInsertedElementIds, setNodes]);

  return {
    addManyIfMissing,
    addIfMissing,
    setNodePosition,
    removeMany,
    clear,
    undoLastInsert,
  } as const;
}
