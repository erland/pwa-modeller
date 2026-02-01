import { useEffect } from 'react';

import type { Model } from '../../../../domain';

import type { AnalysisMode } from '../../AnalysisQueryPanel';

export function useSandboxAutoSeedFromSelection(args: {
  mode: AnalysisMode;
  model: Model | null;
  nodesLength: number;
  selectionElementIds: string[];
  addIfMissing: (elementId: string) => void;
}) {
  const { mode, model, nodesLength, selectionElementIds, addIfMissing } = args;

  useEffect(() => {
    if (mode !== 'sandbox') return;
    if (!model) return;
    if (nodesLength) return;
    const first = selectionElementIds[0];
    if (!first) return;
    if (!model.elements[first]) return;
    addIfMissing(first);
  }, [addIfMissing, model, mode, nodesLength, selectionElementIds]);
}
