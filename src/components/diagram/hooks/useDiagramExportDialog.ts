import { useCallback, useMemo, useState } from 'react';

export function useDiagramExportDialog(activeViewId: string | null | undefined) {
  const [isOpen, setIsOpen] = useState(false);

  const canOpenExportDialog = useMemo(() => !!activeViewId, [activeViewId]);

  const openExportDialog = useCallback(() => {
    if (!activeViewId) return;
    setIsOpen(true);
  }, [activeViewId]);

  const closeExportDialog = useCallback(() => setIsOpen(false), []);

  return { isOpen, canOpenExportDialog, openExportDialog, closeExportDialog };
}
