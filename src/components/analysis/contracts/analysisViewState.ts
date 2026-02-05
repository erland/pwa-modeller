import type { MatrixMetricId } from '../../../domain/analysis/metrics';

import type { MiniGraphOptions } from '../MiniGraphOptions';

/**
 * Step 3: Canonical, UI-only analysis view state.
 *
 * This is intentionally separate from AnalysisRequest (engine inputs).
 * The goal is to capture how the user is *viewing* results (toggles, layout,
 * legends, etc.) without implying recomputation.
 *
 * NOTE: This file introduces types only; wiring is done in later steps.
 */

export type AnalysisViewKind = 'related' | 'paths' | 'traceability' | 'matrix' | 'portfolio' | 'sandbox';

export type AnalysisCommonViewState = {
  /** UI schema version for forward compatibility. */
  version: 1;
  /** Which analysis mode/view this state applies to. */
  kind: AnalysisViewKind;
};

export type ResultsViewState = AnalysisCommonViewState & {
  kind: 'related' | 'paths';

  /** Mini-graph rendering options (UI-only). */
  miniGraphOptions?: MiniGraphOptions;
};

export type TraceabilityViewState = AnalysisCommonViewState & {
  kind: 'traceability';

  /** If true, selecting a node auto-expands it. */
  autoExpand?: boolean;

  /** Traceability mini-graph rendering options (UI-only). */
  miniGraphOptions?: MiniGraphOptions;

  /**
   * Selected saved session name in the sessions dialog.
   * (Does not include persisted session payload.)
   */
  selectedSessionName?: string;
};

export type MatrixViewState = AnalysisCommonViewState & {
  kind: 'matrix';

  /** Heat coloring toggle for the matrix view. */
  heatmapEnabled?: boolean;
  /** Hide rows/columns that have no relationships. */
  hideEmpty?: boolean;
  /** Highlight missing/invalid cells (UI visualization only). */
  highlightMissing?: boolean;
  /** Which metric is shown in cells (or off). */
  cellMetricId?: 'off' | MatrixMetricId;

  /** Optional weight preset used for weighted counts. */
  weightPresetId?: string;
  /** Weight per relationship type. */
  weightsByRelationshipType?: Record<string, number>;
};

export type PortfolioViewState = AnalysisCommonViewState & {
  kind: 'portfolio';

  // Population filters
  layers?: string[];
  types?: string[];
  search?: string;

  // Metric selection
  primaryMetricKey?: string;
  hideMissingMetric?: boolean;

  // Extra columns
  showDegree?: boolean;
  showReach3?: boolean;

  // Grouping + sorting (UI-only)
  groupBy?: 'none' | 'type' | 'layer';
  sortKey?: 'name' | 'type' | 'layer' | 'metric' | 'degree' | 'reach3';
  sortDir?: 'asc' | 'desc';

  /** Currently selected portfolio preset id (if any). */
  presetId?: string;
};

export type SandboxViewState = AnalysisCommonViewState & {
  kind: 'sandbox';

  // Relationship visibility
  showRelationships?: boolean;
  relationshipMode?: 'all' | 'types' | 'explicit';
  enabledRelationshipTypes?: string[];

  // Add-related options
  addRelatedDepth?: number;
  addRelatedDirection?: 'incoming' | 'outgoing' | 'both';
  addRelatedEnabledTypes?: string[];

  // UI/persistence options
  persistEnabled?: boolean;
  edgeRouting?: 'straight' | 'orthogonal';
};

export type AnalysisViewState =
  | ResultsViewState
  | TraceabilityViewState
  | MatrixViewState
  | PortfolioViewState
  | SandboxViewState;
