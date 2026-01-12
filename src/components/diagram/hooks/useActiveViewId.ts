import { useEffect, useState } from 'react';
import type { Model, View } from '../../../domain';
import type { Selection } from '../../model/selection';

/**
 * Keeps the active view id in sync with selection and available views.
 */
export function useActiveViewId(model: Model | null, views: View[], selection: Selection) {
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const selectionViewId =
    selection.kind === 'view' || selection.kind === 'viewNode' || selection.kind === 'viewObject' ? selection.viewId : null;
  const firstViewId = views[0]?.id ?? null;

  useEffect(() => {
    if (!model) {
      setActiveViewId(null);
      return;
    }

    if (selectionViewId) {
      setActiveViewId(selectionViewId);
      return;
    }

    // Keep current if it still exists; otherwise default to first view.
    if (activeViewId && model.views[activeViewId]) return;
    setActiveViewId(firstViewId);
  }, [model, selectionViewId, firstViewId, activeViewId]);

  return { activeViewId, setActiveViewId };
}
