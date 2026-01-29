import { useCallback, useState } from 'react';

/**
 * Owns draft + active element id state for Analysis workspace.
 *
 * - Draft ids: what the user has currently selected/typed in the Query panel.
 * - Active ids: what drives the currently computed result.
 *
 * NOTE: We keep the historical behavior where "Start" and "Source" are kept in sync
 * via the *sync* setters, but some flows (e.g. "Open traceability") intentionally set
 * only the Start id.
 */
export function useAnalysisDraftActiveIdsState() {
  // Draft inputs (user edits these).
  const [draftStartId, setDraftStartId] = useState<string>('');
  const [draftSourceId, setDraftSourceId] = useState<string>('');
  const [draftTargetId, setDraftTargetId] = useState<string>('');

  // Active ids (used for the current computed result).
  const [activeStartId, setActiveStartId] = useState<string>('');
  const [activeSourceId, setActiveSourceId] = useState<string>('');
  const [activeTargetId, setActiveTargetId] = useState<string>('');

  // Keep "Start element" (Related/Traceability) and "Source" (Connection between two) in sync.
  // This makes it easy to switch between views without having to re-pick the baseline element.
  const setDraftStartIdSync = useCallback((id: string) => {
    setDraftStartId(id);
    setDraftSourceId(id);
  }, []);

  const setDraftSourceIdSync = useCallback((id: string) => {
    setDraftSourceId(id);
    setDraftStartId(id);
  }, []);

  return {
    draft: {
      startId: draftStartId,
      sourceId: draftSourceId,
      targetId: draftTargetId,
    },
    active: {
      startId: activeStartId,
      sourceId: activeSourceId,
      targetId: activeTargetId,
    },
    actions: {
      // Raw setters (use sparingly)
      setDraftStartId,
      setDraftSourceId,
      setDraftTargetId,
      setActiveStartId,
      setActiveSourceId,
      setActiveTargetId,

      // Sync setters (preferred)
      setDraftStartIdSync,
      setDraftSourceIdSync,
    },
  } as const;
}
