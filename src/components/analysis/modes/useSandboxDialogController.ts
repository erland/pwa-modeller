import { useCallback, useState } from 'react';

import type { SandboxSelectedEdge } from './useSandboxSelectionController';

export function useSandboxDialogController({
  pairAnchors,
  insertAnchors,
  addRelatedAnchors,
  selectedEdge,
}: {
  pairAnchors: string[];
  insertAnchors: string[];
  addRelatedAnchors: string[];
  selectedEdge: SandboxSelectedEdge | null;
}): {
  saveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;

  insertBetweenDialogOpen: boolean;
  insertBetweenEndpoints: [string, string] | null;
  openInsertBetweenDialog: () => void;
  closeInsertBetweenDialog: () => void;

  insertFromEdgeDialogOpen: boolean;
  insertFromEdgeEndpoints: [string, string] | null;
  openInsertFromSelectedEdgeDialog: () => void;
  closeInsertFromEdgeDialog: () => void;

  addRelatedDialogOpen: boolean;
  addRelatedDialogAnchors: string[];
  openAddRelatedDialog: () => void;
  closeAddRelatedDialog: () => void;
} {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const [insertBetweenDialogOpen, setInsertBetweenDialogOpen] = useState(false);
  const [insertBetweenEndpoints, setInsertBetweenEndpoints] = useState<[string, string] | null>(null);

  const [insertFromEdgeDialogOpen, setInsertFromEdgeDialogOpen] = useState(false);
  const [insertFromEdgeEndpoints, setInsertFromEdgeEndpoints] = useState<[string, string] | null>(null);

  const [addRelatedDialogOpen, setAddRelatedDialogOpen] = useState(false);
  const [addRelatedDialogAnchors, setAddRelatedDialogAnchors] = useState<string[]>([]);

  const openInsertBetweenDialog = useCallback(() => {
    const anchors = pairAnchors.length ? pairAnchors : insertAnchors;
    if (anchors.length !== 2) return;
    setInsertBetweenEndpoints([anchors[0], anchors[1]]);
    setInsertBetweenDialogOpen(true);
  }, [insertAnchors, pairAnchors]);

  const closeInsertBetweenDialog = useCallback(() => {
    setInsertBetweenDialogOpen(false);
  }, []);

  const openInsertFromSelectedEdgeDialog = useCallback(() => {
    if (!selectedEdge) return;
    setInsertFromEdgeEndpoints([selectedEdge.sourceElementId, selectedEdge.targetElementId]);
    setInsertFromEdgeDialogOpen(true);
  }, [selectedEdge]);

  const closeInsertFromEdgeDialog = useCallback(() => {
    setInsertFromEdgeDialogOpen(false);
  }, []);

  const openAddRelatedDialog = useCallback(() => {
    if (addRelatedAnchors.length === 0) return;
    setAddRelatedDialogAnchors(addRelatedAnchors);
    setAddRelatedDialogOpen(true);
  }, [addRelatedAnchors]);

  const closeAddRelatedDialog = useCallback(() => {
    setAddRelatedDialogOpen(false);
  }, []);

  return {
    saveDialogOpen,
    setSaveDialogOpen,
    insertBetweenDialogOpen,
    insertBetweenEndpoints,
    openInsertBetweenDialog,
    closeInsertBetweenDialog,
    insertFromEdgeDialogOpen,
    insertFromEdgeEndpoints,
    openInsertFromSelectedEdgeDialog,
    closeInsertFromEdgeDialog,
    addRelatedDialogOpen,
    addRelatedDialogAnchors,
    openAddRelatedDialog,
    closeAddRelatedDialog,
  };
}
