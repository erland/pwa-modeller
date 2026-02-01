import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

import { defaultMiniGraphOptions } from '../MiniGraphOptions';
import { loadAnalysisUiState, mergeAnalysisUiState } from '../analysisUiStateStorage';

export function useMiniGraphOptionsForModel(modelId: string): {
  graphOptions: typeof defaultMiniGraphOptions;
  setGraphOptions: Dispatch<SetStateAction<typeof defaultMiniGraphOptions>>;
} {
  const [graphOptions, setGraphOptions] = useState(defaultMiniGraphOptions);

  useEffect(() => {
    if (!modelId) return;
    const ui = loadAnalysisUiState(modelId);
    if (ui?.miniGraphOptions) {
      setGraphOptions({ ...defaultMiniGraphOptions, ...ui.miniGraphOptions, wrapLabels: true, autoFitColumns: true });
    }
  }, [modelId]);

  useEffect(() => {
    if (!modelId) return;
    mergeAnalysisUiState(modelId, { miniGraphOptions: graphOptions });
  }, [modelId, graphOptions]);

  return { graphOptions, setGraphOptions };
}
