import { useCallback } from 'react';
import type { MouseEvent } from 'react';

import type { Relationship } from '../../../domain';
import type { Selection } from '../../model/selection';
import type { SandboxNode } from '../workspace/controller/sandboxTypes';

import {
  type SandboxSelectedEdge,
  toggleEdgeSelection,
  useSandboxSelectionState,
} from './sandboxSelection';

export type { SandboxSelectedEdge } from './sandboxSelection';

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
  const {
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
  } = useSandboxSelectionState({
    selection,
    selectionElementIds,
    nodeById,
    modelRelationships,
  });

  const onEdgeHitClick = useCallback(
    (e: MouseEvent<SVGPathElement>, relationshipId: string) => {
      e.stopPropagation();

      // Toggle relationship selection: clicking the selected edge again clears selection.
      const next = toggleEdgeSelection(selectedEdgeId, relationshipId);
      if (!next) {
        blurDocumentActiveElement();
        clearLocalSelection();
        onClearSelection();
        return;
      }

      selectRelationship(next);
      onSelectRelationship(next);
    },
    [clearLocalSelection, onClearSelection, onSelectRelationship, selectRelationship, selectedEdgeId]
  );

  const onCanvasClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      // Only treat clicks on the SVG background as "clear selection".
      if (e.target !== e.currentTarget) return;
      if (consumeSuppressNextBackgroundClick()) return;
      blurDocumentActiveElement();
      clearLocalSelection();
      onClearSelection();
    },
    [clearLocalSelection, consumeSuppressNextBackgroundClick, onClearSelection]
  );

  const onClickNode = useCallback(
    (e: MouseEvent<SVGGElement>, elementId: string) => {
      e.stopPropagation();
      clickNode(elementId, e.shiftKey);

      onSelectElement(elementId);
    },
    [clickNode, onSelectElement]
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
