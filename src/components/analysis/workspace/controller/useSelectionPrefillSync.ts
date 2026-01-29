import { useEffect } from 'react';

import type { AnalysisMode } from '../../AnalysisQueryPanel';

/**
 * Keeps draft element ids conveniently prefilled from the current selection.
 *
 * This is intentionally a thin extraction from the workspace controller to keep
 * behavior stable while we refactor.
 */
export function useSelectionPrefillSync({
  mode,
  selectedElementId,
  draftStartId,
  draftSourceId,
  draftTargetId,
  setDraftStartIdSync,
  setDraftSourceIdSync,
  setDraftTargetId,
}: {
  mode: AnalysisMode;
  selectedElementId: string | null;
  draftStartId: string;
  draftSourceId: string;
  draftTargetId: string;
  setDraftStartIdSync: (id: string) => void;
  setDraftSourceIdSync: (id: string) => void;
  setDraftTargetId: (id: string) => void;
}) {
  // If the user has an element selected and the draft is empty, prefill to reduce friction.
  useEffect(() => {
    if (!selectedElementId) return;

    if (mode !== 'paths' && mode !== 'matrix') {
      if (!draftStartId) setDraftStartIdSync(selectedElementId);
      return;
    }
    if (mode === 'paths') {
      if (!draftSourceId) setDraftSourceIdSync(selectedElementId);
      else if (!draftTargetId && draftSourceId !== selectedElementId) setDraftTargetId(selectedElementId);
    }
  }, [
    mode,
    draftStartId,
    draftSourceId,
    draftTargetId,
    setDraftStartIdSync,
    setDraftSourceIdSync,
    setDraftTargetId,
    selectedElementId,
  ]);
}
