import { useCallback } from 'react';

import type { Model } from '../../../../domain';

import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesOptions,
  SandboxNode,
} from './sandboxTypes';
import { applyNodeCap } from './sandboxStateCaps';
import { SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxStateConstants';
import { computeIntermediatesNewNodes, computeRelatedNewNodes } from './sandboxStateInsertion';

export function useSandboxGraphActions(args: {
  model: Model | null;
  maxNodes: number;
  emitWarning: (msg: string) => void;

  addRelatedDepth: number;
  addRelatedDirection: SandboxAddRelatedDirection;
  addRelatedEnabledTypes: string[];

  setNodes: React.Dispatch<React.SetStateAction<SandboxNode[]>>;
  setLastInsertedElementIds: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const {
    model,
    maxNodes,
    emitWarning,
    addRelatedDepth,
    addRelatedDirection,
    addRelatedEnabledTypes,
    setNodes,
    setLastInsertedElementIds,
  } = args;

  const addRelatedFromSelection = useCallback(
    (anchorElementIds: string[], allowedElementIds?: string[]) => {
      if (!model) return;
      if (addRelatedEnabledTypes.length === 0) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));

        const newNodes = computeRelatedNewNodes({
          model,
          existingNodes: prev,
          anchorElementIds,
          depth: addRelatedDepth,
          direction: addRelatedDirection,
          enabledRelationshipTypes: addRelatedEnabledTypes,
          allowedElementIds,
          nodeW: SANDBOX_NODE_W,
          nodeH: SANDBOX_NODE_H,
        });

        if (newNodes.length === 0) return prev;

        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }

        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [addRelatedDepth, addRelatedDirection, addRelatedEnabledTypes, emitWarning, maxNodes, model, setLastInsertedElementIds, setNodes]
  );

  const insertIntermediatesBetween = useCallback(
    (sourceElementId: string, targetElementId: string, options: SandboxInsertIntermediatesOptions) => {
      if (!model) return;
      if (!sourceElementId || !targetElementId) return;
      if (sourceElementId === targetElementId) return;
      if (addRelatedEnabledTypes.length === 0) return;

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.elementId));

        const newNodes = computeIntermediatesNewNodes({
          model,
          existingNodes: prev,
          sourceElementId,
          targetElementId,
          options,
          enabledRelationshipTypes: addRelatedEnabledTypes,
          nodeW: SANDBOX_NODE_W,
          nodeH: SANDBOX_NODE_H,
        });

        if (newNodes.length === 0) return prev;

        const capped = applyNodeCap({ prev, toAdd: newNodes, maxNodes });
        if (capped.dropped > 0) {
          emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
        }

        const insertedIds = capped.next.filter((n) => !existing.has(n.elementId)).map((n) => n.elementId);
        setLastInsertedElementIds(insertedIds);
        return capped.next;
      });
    },
    [addRelatedEnabledTypes, emitWarning, maxNodes, model, setLastInsertedElementIds, setNodes]
  );

  return { addRelatedFromSelection, insertIntermediatesBetween } as const;
}
