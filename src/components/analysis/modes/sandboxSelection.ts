import { useEffect, useMemo, useState } from 'react';

import type { Relationship } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { SandboxNode } from '../workspace/controller/sandboxTypes';

export type SandboxSelectedEdge = {
  id: string;
  type: string;
  sourceElementId: string;
  targetElementId: string;
};

export function getSelectedElementId(selection: Selection): string | null {
  switch (selection.kind) {
    case 'element':
      return selection.elementId;
    case 'viewNode':
      return selection.elementId;
    case 'viewNodes':
      return selection.elementIds[0] ?? null;
    default:
      return null;
  }
}

export function updatePairSelectionOnNodeClick(prev: string[], elementId: string, shiftKey: boolean): string[] {
  if (!shiftKey) return [elementId];

  const cur = prev.filter(Boolean);
  if (cur.length === 0) return [elementId];
  if (cur.length === 1) {
    return cur[0] === elementId ? [] : [cur[0], elementId];
  }

  const [a, b] = cur;
  if (elementId === a) return [b];
  if (elementId === b) return [a];
  // Replace the secondary selection but keep the primary stable.
  return [a, elementId];
}

export function computeInsertAnchors(selectionElementIds: string[], nodeById: Map<string, SandboxNode>): string[] {
  const uniq = Array.from(new Set(selectionElementIds.filter((id) => nodeById.has(id))));
  return uniq;
}

export function computePairAnchors(pairSelection: string[], nodeById: Map<string, SandboxNode>): string[] {
  const uniq = Array.from(new Set(pairSelection.filter((id) => nodeById.has(id))));
  return uniq.slice(0, 2);
}

export function computeAddRelatedAnchors(
  pairSelection: string[],
  selectionElementIds: string[],
  nodeById: Map<string, SandboxNode>
): string[] {
  const raw = pairSelection.length ? pairSelection : selectionElementIds;
  const uniq = Array.from(new Set(raw.filter((id) => nodeById.has(id))));
  return uniq;
}

export function computeSelectedEdge(
  selectedEdgeId: string | null,
  modelRelationships: Record<string, Relationship>,
  nodeById: Map<string, SandboxNode>
): SandboxSelectedEdge | null {
  if (!selectedEdgeId) return null;
  const r = (modelRelationships as Record<string, Relationship | undefined>)[selectedEdgeId];
  if (!r) return null;
  if (!r.sourceElementId || !r.targetElementId) return null;
  if (!nodeById.has(r.sourceElementId)) return null;
  if (!nodeById.has(r.targetElementId)) return null;
  return {
    id: r.id,
    type: String(r.type),
    sourceElementId: r.sourceElementId,
    targetElementId: r.targetElementId,
  };
}

export function toggleEdgeSelection(currentSelectedEdgeId: string | null, relationshipId: string): string | null {
  return currentSelectedEdgeId === relationshipId ? null : relationshipId;
}

export function useSandboxSelectionState({
  selection,
  selectionElementIds,
  nodeById,
  modelRelationships,
}: {
  selection: Selection;
  selectionElementIds: string[];
  nodeById: Map<string, SandboxNode>;
  modelRelationships: Record<string, Relationship>;
}): {
  selectedElementId: string | null;
  selectedEdgeId: string | null;
  selectedEdge: SandboxSelectedEdge | null;
  pairSelection: string[];
  pairAnchors: string[];
  addRelatedAnchors: string[];
  insertAnchors: string[];
  clearLocalSelection: () => void;
  selectRelationship: (relationshipId: string) => void;
  clickNode: (elementId: string, shiftKey: boolean) => void;
} {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Sandbox-local pair selection for "Insert between".
  // Keeps sandbox operations independent from the global single-selection UX.
  const [pairSelection, setPairSelection] = useState<string[]>([]);

  // Keep local edge highlight in sync with global selection so the PropertiesPanel can drive selection.
  useEffect(() => {
    if (selection.kind === 'relationship') {
      setSelectedEdgeId(selection.relationshipId);
      setPairSelection([]);
      return;
    }
    setSelectedEdgeId(null);
  }, [selection]);

  const selectedElementId = useMemo(() => getSelectedElementId(selection), [selection]);

  const insertAnchors = useMemo(
    () => computeInsertAnchors(selectionElementIds, nodeById),
    [nodeById, selectionElementIds]
  );

  const pairAnchors = useMemo(() => computePairAnchors(pairSelection, nodeById), [nodeById, pairSelection]);

  const addRelatedAnchors = useMemo(
    () => computeAddRelatedAnchors(pairSelection, selectionElementIds, nodeById),
    [nodeById, pairSelection, selectionElementIds]
  );

  const selectedEdge = useMemo(
    () => computeSelectedEdge(selectedEdgeId, modelRelationships, nodeById),
    [modelRelationships, nodeById, selectedEdgeId]
  );

  const clearLocalSelection = (): void => {
    setSelectedEdgeId(null);
    setPairSelection([]);
  };

  const selectRelationship = (relationshipId: string): void => {
    setSelectedEdgeId(relationshipId);
    setPairSelection([]);
  };

  const clickNode = (elementId: string, shiftKey: boolean): void => {
    setSelectedEdgeId(null);
    setPairSelection((prev) => updatePairSelectionOnNodeClick(prev, elementId, shiftKey));
  };

  return {
    selectedElementId,
    selectedEdgeId,
    selectedEdge,
    pairSelection,
    pairAnchors,
    addRelatedAnchors,
    insertAnchors,
    clearLocalSelection,
    selectRelationship,
    clickNode,
  };
}
