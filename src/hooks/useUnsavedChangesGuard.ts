import { useEffect, useRef } from 'react';

import { isAuthNavigationInProgress } from '../auth/oidcPkceAuth';

/**
 * Adds:
 * - `beforeunload` confirmation when there are unsaved changes.
 * - Optional document title marker ("* ") while dirty.
 */
export function useUnsavedChangesGuard(isDirty: boolean, opts?: { markTitle?: boolean }): void {
  const baseTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (baseTitleRef.current === null) {
      baseTitleRef.current = document.title || 'PWA Modeller';
    }

    if (opts?.markTitle) {
      const base = baseTitleRef.current;
      const desired = isDirty ? `* ${base.replace(/^\*\s+/, '')}` : base.replace(/^\*\s+/, '');
      if (document.title !== desired) document.title = desired;
    }
  }, [isDirty, opts?.markTitle]);

  useEffect(() => {
    function onBeforeUnload(ev: BeforeUnloadEvent) {
      if (!isDirty) return;
      // During OIDC redirect login, we intentionally leave the page.
      if (isAuthNavigationInProgress()) return;
      // Chrome requires returnValue to be set.
      ev.preventDefault();
      ev.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isDirty]);
}
