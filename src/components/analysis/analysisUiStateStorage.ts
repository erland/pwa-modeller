import type { MatrixMetricId } from '../../domain/analysis/metrics';

import type { MiniGraphOptions } from './MiniGraphOptions';

export type AnalysisUiStateV1 = {
  version: 1;
  miniGraphOptions?: MiniGraphOptions;
  matrix?: {
    cellMetricId?: 'off' | MatrixMetricId;
    heatmapEnabled?: boolean;
    hideEmpty?: boolean;
    highlightMissing?: boolean;
    weightPresetId?: string;
    weightsByRelationshipType?: Record<string, number>;
  };
};

type AnyState = AnalysisUiStateV1;

function key(modelId: string): string {
  return `ea-modeller:analysis:ui:${modelId}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadAnalysisUiState(modelId: string): AnyState | null {
  if (!modelId) return null;
  const parsed = safeParse<AnyState>(localStorage.getItem(key(modelId)));
  if (!parsed || typeof parsed !== 'object') return null;
  if ((parsed as AnyState).version !== 1) return null;
  return parsed;
}

export function saveAnalysisUiState(modelId: string, state: AnyState): void {
  if (!modelId) return;
  localStorage.setItem(key(modelId), JSON.stringify(state));
}

export function mergeAnalysisUiState(modelId: string, patch: Partial<AnalysisUiStateV1>): AnalysisUiStateV1 {
  const current = loadAnalysisUiState(modelId) ?? ({ version: 1 } as AnalysisUiStateV1);
  const next: AnalysisUiStateV1 = {
    version: 1,
    miniGraphOptions: patch.miniGraphOptions ?? current.miniGraphOptions,
    matrix: {
      ...(current.matrix ?? {}),
      ...(patch.matrix ?? {})
    }
  };
  saveAnalysisUiState(modelId, next);
  return next;
}
