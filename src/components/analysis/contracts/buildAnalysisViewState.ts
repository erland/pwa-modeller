import type { AnalysisMode } from '../AnalysisQueryPanel';

import type { AnalysisUiStateV1 } from '../analysisUiStateStorage';

import type { AnalysisViewState } from './analysisViewState';

/**
 * Step 3 helper: build a canonical AnalysisViewState from currently known UI-only state.
 *
 * This intentionally does NOT drive computation and should be safe to call during export.
 *
 * Notes:
 * - For Results/Matrix/Portfolio, we can pull persisted options from AnalysisUiState.
 * - For Sandbox/Traceability, the view state is currently mostly local; callers can
 *   pass overrides via the optional args.
 */
export function buildAnalysisViewState(args: {
  mode: AnalysisMode;
  persistedUi?: AnalysisUiStateV1 | null;

  // Optional overrides for modes whose view-state is local (not persisted yet)
  traceability?: { autoExpand?: boolean; selectedSessionName?: string; miniGraphOptions?: AnalysisUiStateV1['miniGraphOptions'] };
  sandbox?: {
    showRelationships?: boolean;
    relationshipMode?: 'all' | 'types' | 'explicit';
    enabledRelationshipTypes?: string[];
    addRelatedDepth?: number;
    addRelatedDirection?: 'incoming' | 'outgoing' | 'both';
    addRelatedEnabledTypes?: string[];
    persistEnabled?: boolean;
    edgeRouting?: 'straight' | 'orthogonal';
  };
}): AnalysisViewState {
  const ui = args.persistedUi ?? null;

  if (args.mode === 'matrix') {
    const m = ui?.matrix;
    return {
      version: 1,
      kind: 'matrix',
      cellMetricId: m?.cellMetricId,
      heatmapEnabled: m?.heatmapEnabled,
      hideEmpty: m?.hideEmpty,
      highlightMissing: m?.highlightMissing,
      weightPresetId: m?.weightPresetId,
      weightsByRelationshipType: m?.weightsByRelationshipType,
    };
  }

  if (args.mode === 'portfolio') {
    const p = ui?.portfolio;
    return {
      version: 1,
      kind: 'portfolio',
      presetId: p?.presetId,
      layers: p?.layers,
      types: p?.types,
      search: p?.search,
      primaryMetricKey: p?.primaryMetricKey,
      hideMissingMetric: p?.hideMissingMetric,
      showDegree: p?.showDegree,
      showReach3: p?.showReach3,
      groupBy: p?.groupBy,
      sortKey: p?.sortKey,
      sortDir: p?.sortDir,
    };
  }

  if (args.mode === 'sandbox') {
    const s = args.sandbox;
    return {
      version: 1,
      kind: 'sandbox',
      showRelationships: s?.showRelationships,
      relationshipMode: s?.relationshipMode,
      enabledRelationshipTypes: s?.enabledRelationshipTypes,
      addRelatedDepth: s?.addRelatedDepth,
      addRelatedDirection: s?.addRelatedDirection,
      addRelatedEnabledTypes: s?.addRelatedEnabledTypes,
      persistEnabled: s?.persistEnabled,
      edgeRouting: s?.edgeRouting,
    };
  }

  if (args.mode === 'traceability') {
    const t = args.traceability;
    return {
      version: 1,
      kind: 'traceability',
      autoExpand: t?.autoExpand,
      selectedSessionName: t?.selectedSessionName,
      miniGraphOptions: t?.miniGraphOptions ?? ui?.miniGraphOptions,
    };
  }

  // related / paths
  return {
    version: 1,
    kind: args.mode === 'paths' ? 'paths' : 'related',
    miniGraphOptions: ui?.miniGraphOptions,
  };
}
