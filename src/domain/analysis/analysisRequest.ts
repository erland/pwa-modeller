import type { ElementType, RelationshipType } from '../types';
import type { AnalysisDirection } from './filters';
import type { RelationshipMatrixDirection } from './relationshipMatrix';
import type { PathsBetweenQueryMode } from '../../store/analysis';

/**
 * Canonical analysis *engine input* shapes.
 *
 * Step 2 introduces these as a thin, typed wrapper over existing analysis inputs.
 * They are NOT yet wired into runtime behavior; they are intended to:
 *  - provide a stable serialization shape for exports/reporting
 *  - make "recompute" possible later by re-running the same request
 */

export type AnalysisCommonFilters = {
  direction: AnalysisDirection;
  relationshipTypes?: RelationshipType[];
  layers?: string[];
  elementTypes?: ElementType[];
};

export type RelatedRequest = {
  kind: 'related';
  startId: string;
  filters: AnalysisCommonFilters;
  maxDepth: number;
  includeStart: boolean;
};

export type TraceabilityRequest = {
  kind: 'traceability';
  startId: string;
  filters: AnalysisCommonFilters;
  maxDepth: number;
  includeStart: boolean;
};

export type PathsRequest = {
  kind: 'paths';
  sourceId: string;
  targetId: string;
  filters: AnalysisCommonFilters;
  maxPaths: number;
  maxPathLength?: number;
  pathsMode: PathsBetweenQueryMode;
};

export type MatrixBuiltQuery = {
  rowIds: string[];
  colIds: string[];
  relationshipTypes: RelationshipType[];
  direction: RelationshipMatrixDirection;
};

export type MatrixRequest = {
  kind: 'matrix';
  /**
   * Matrix queries are explicit (axes are resolved to ids). This is what actually drives computation.
   *
   * Note: UI-only options (heatmap, weights, cell metric, hide empty, etc.) will live in ViewState.
   */
  builtQuery: MatrixBuiltQuery;
};

export type PortfolioRequest = {
  kind: 'portfolio';

  // Population filters
  layers?: string[];
  types?: string[]; // ElementType[] in practice; kept as string[] to avoid coupling to facet availability
  search?: string;

  // Metric selection / computed enrichments
  metricKey?: string;
  hideMissingMetric: boolean;
  showDegree: boolean;
  showReach3: boolean;

  // Affects computed grouping (not just rendering)
  groupBy: 'none' | 'type' | 'layer';
};

export type SandboxRequest = {
  kind: 'sandbox';
  /**
   * Minimal seed information for future recompute.
   * Current sandbox behavior is mostly interactive; Step 2 keeps this minimal.
   */
  seedElementIds: string[];
};

export type AnalysisRequest = RelatedRequest | TraceabilityRequest | PathsRequest | MatrixRequest | PortfolioRequest | SandboxRequest;
