import { useCallback, useEffect, useRef, useState } from 'react';

export type SandboxInsertSelectionState = {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedIdsRef: React.MutableRefObject<Set<string>>;

  toggleSelectedId: (id: string) => void;
  selectNone: () => void;
};

export function useSandboxInsertSelectionState(args: { openNonce: number }): SandboxInsertSelectionState {
  const { openNonce } = args;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  // Reset selection whenever the dialog opens.
  useEffect(() => {
    if (openNonce === 0) return;
    setSelectedIds(new Set());
  }, [openNonce]);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    setSelectedIds,
    selectedIdsRef,
    toggleSelectedId,
    selectNone,
  };
}
