import { useEffect, useState } from 'react';
import type { Model, View } from '../../../domain';
import type { Selection } from '../../model/selection';

/**
 * Keeps the active view id in sync with selection and available views.
 */
export function useActiveViewId(model: Model | null, views: View[], selection: Selection) {
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    if (!model) {
      setActiveViewId(null);
      return;
    }

    if (selection.kind === 'view') {
      setActiveViewId(selection.viewId);
      return;
    }
    if (selection.kind === 'viewNode') {
      setActiveViewId(selection.viewId);
      return;
    }
    if (selection.kind === 'viewObject') {
      setActiveViewId(selection.viewId);
      return;
    }

    // Keep current if it still exists; otherwise default to first view.
    if (activeViewId && model.views[activeViewId]) return;
    setActiveViewId(views[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    model,
    selection.kind === 'view'
      ? selection.viewId
      : selection.kind === 'viewNode'
        ? selection.viewId
        : selection.kind === 'viewObject'
          ? selection.viewId
          : null,
    views.length,
  ]);

  return { activeViewId, setActiveViewId };
}
