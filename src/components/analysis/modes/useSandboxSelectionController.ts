import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';

import type { Relationship } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { SandboxNode } from '../workspace/controller/sandboxTypes';

function blurDocumentActiveElement(): void {
  const active = document.activeElement;
  if (!active) return;
  if (active instanceof HTMLElement) {
    active.blur();
    return;
  }

  // Some browsers can place focus on SVG elements; blur() isn't always typed on Element.
  const maybe = active as unknown as { blur?: () => void };
  if (typeof maybe.blur === 'function') maybe.blur();
}

function getSelectedElementId(selection: Selection): string | null {
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

export type SandboxSelectedEdge = {
  id: string;
  type: string;
  sourceElementId: string;
  targetElementId: string;
};

export function useSandboxSelectionController({
  selection,
  selectionElementIds,
  nodeById,
  modelRelationships,
  consumeSuppressNextBackgroundClick,
  onSelectElement,
  onSelectRelationship,
  onClearSelection,
}: {
  selection: Selection;
  selectionElementIds: string[];
  nodeById: Map<string, SandboxNode>;
  modelRelationships: Record<string, Relationship>;
  consumeSuppressNextBackgroundClick: () => boolean;
  onSelectElement: (elementId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
  onClearSelection: () => void;
}): {
  selectedElementId: string | null;
  selectedEdgeId: string | null;
  selectedEdge: SandboxSelectedEdge | null;
  pairSelection: string[];
  pairAnchors: string[];
  addRelatedAnchors: string[];
  insertAnchors: string[];
  onEdgeHitClick: (e: MouseEvent<SVGPathElement>, relationshipId: string) => void;
  onCanvasClick: (e: MouseEvent<SVGSVGElement>) => void;
  onClickNode: (e: MouseEvent<SVGGElement>, elementId: string) => void;
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

  const insertAnchors = useMemo(() => {
    const uniq = Array.from(new Set(selectionElementIds.filter((id) => nodeById.has(id))));
    return uniq;
  }, [nodeById, selectionElementIds]);

  const pairAnchors = useMemo(() => {
    const uniq = Array.from(new Set(pairSelection.filter((id) => nodeById.has(id))));
    return uniq.slice(0, 2);
  }, [nodeById, pairSelection]);

  const addRelatedAnchors = useMemo(() => {
    const raw = pairSelection.length ? pairSelection : selectionElementIds;
    const uniq = Array.from(new Set(raw.filter((id) => nodeById.has(id))));
    return uniq;
  }, [nodeById, pairSelection, selectionElementIds]);

  const selectedEdge = useMemo((): SandboxSelectedEdge | null => {
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
  }, [modelRelationships, nodeById, selectedEdgeId]);

  const onEdgeHitClick = useCallback(
    (e: MouseEvent<SVGPathElement>, relationshipId: string) => {
      e.stopPropagation();

      // Toggle relationship selection: clicking the selected edge again clears selection.
      if (selectedEdgeId === relationshipId) {
        blurDocumentActiveElement();
        setSelectedEdgeId(null);
        setPairSelection([]);
        onClearSelection();
        return;
      }

      setSelectedEdgeId(relationshipId);
      setPairSelection([]);
      onSelectRelationship(relationshipId);
    },
    [onClearSelection, onSelectRelationship, selectedEdgeId]
  );

  const onCanvasClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      // Only treat clicks on the SVG background as "clear selection".
      if (e.target !== e.currentTarget) return;
      if (consumeSuppressNextBackgroundClick()) return;
      blurDocumentActiveElement();
      setSelectedEdgeId(null);
      setPairSelection([]);
      onClearSelection();
    },
    [consumeSuppressNextBackgroundClick, onClearSelection]
  );

  const onClickNode = useCallback(
    (e: MouseEvent<SVGGElement>, elementId: string) => {
      e.stopPropagation();
      setSelectedEdgeId(null);

      if (e.shiftKey) {
        setPairSelection((prev) => {
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
        });
      } else {
        // Normal click sets a single local selection (primary).
        setPairSelection([elementId]);
      }

      onSelectElement(elementId);
    },
    [onSelectElement]
  );

  return {
    selectedElementId,
    selectedEdgeId,
    selectedEdge,
    pairSelection,
    pairAnchors,
    addRelatedAnchors,
    insertAnchors,
    onEdgeHitClick,
    onCanvasClick,
    onClickNode,
  };
}
