import { useEffect } from 'react';

function isTextLikeTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable;
}

/**
 * Sandbox keyboard shortcuts.
 *
 * Intentionally conservative (only universally expected keys):
 * - Escape: close dialogs/overlay, otherwise clear selection
 * - Delete/Backspace: remove selected sandbox nodes (when allowed)
 */
export function useSandboxShortcuts({
  enabled,
  isAnyDialogOpen,
  closeAllDialogs,
  clearSelection,
  canRemoveSelected,
  removeSelected,
}: {
  enabled: boolean;
  isAnyDialogOpen: boolean;
  closeAllDialogs: () => void;
  clearSelection: () => void;
  canRemoveSelected: boolean;
  removeSelected: () => void;
}): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextLikeTarget(e.target)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (isAnyDialogOpen) {
          closeAllDialogs();
        } else {
          clearSelection();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isAnyDialogOpen) return;
        if (!canRemoveSelected) return;
        e.preventDefault();
        removeSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabled,
    isAnyDialogOpen,
    closeAllDialogs,
    clearSelection,
    canRemoveSelected,
    removeSelected,
  ]);
}
