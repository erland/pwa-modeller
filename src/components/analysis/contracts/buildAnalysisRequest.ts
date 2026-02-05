import type { AnalysisMode } from '../AnalysisQueryPanel';
import type { AnalysisDirection, ElementType, RelationshipType } from '../../../domain';
import type { PathsBetweenQueryMode } from '../../../store';
import type {
  AnalysisRequest,
  AnalysisCommonFilters,
  MatrixBuiltQuery,
  PortfolioRequest,
} from '../../../domain/analysis';

/**
 * Step 2 helper: build a canonical AnalysisRequest from the current workspace state.
 *
 * NOTE: This is a thin wrapper intended for serialization/export. It intentionally
 * mirrors current behavior (active ids + draft filters).
 */
export function buildAnalysisRequest(args: {
  mode: AnalysisMode;

  // Active ids (what actually drives results today)
  activeStartId: string;
  activeSourceId: string;
  activeTargetId: string;

  // Draft filters (QoL: immediately affect results)
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];

  // Related/Traceability
  maxDepth: number;
  includeStart: boolean;

  // Paths
  maxPaths: number;
  maxPathLength: number | null;
  pathsMode: PathsBetweenQueryMode;

  // Matrix
  matrixBuiltQuery: MatrixBuiltQuery | null;

  // Portfolio (computed directly from UI in PortfolioAnalysisView)
  portfolio?: Omit<PortfolioRequest, 'kind'>;
}): AnalysisRequest {
  const filters: AnalysisCommonFilters = {
    direction: args.direction,
    relationshipTypes: args.relationshipTypes.length ? args.relationshipTypes : undefined,
    layers: args.layers.length ? args.layers : undefined,
    elementTypes: args.elementTypes.length ? args.elementTypes : undefined,
  };

  if (args.mode === 'matrix') {
    // Matrix results are driven by a resolved/built query.
    return {
      kind: 'matrix',
      builtQuery:
        args.matrixBuiltQuery ??
        ({ rowIds: [], colIds: [], relationshipTypes: [], direction: 'both' } as MatrixBuiltQuery),
    };
  }

  if (args.mode === 'paths') {
    return {
      kind: 'paths',
      sourceId: args.activeSourceId,
      targetId: args.activeTargetId,
      filters,
      maxPaths: args.maxPaths,
      maxPathLength: args.maxPathLength === null ? undefined : args.maxPathLength,
      pathsMode: args.pathsMode,
    };
  }

  if (args.mode === 'portfolio') {
    return {
      kind: 'portfolio',
      ...(args.portfolio ?? {
        hideMissingMetric: false,
        showDegree: false,
        showReach3: false,
        groupBy: 'none',
      }),
    };
  }

  if (args.mode === 'sandbox') {
    // Sandbox is primarily interactive; capture a minimal seed.
    return {
      kind: 'sandbox',
      seedElementIds: args.activeStartId ? [args.activeStartId] : [],
    };
  }

  if (args.mode === 'traceability') {
    return {
      kind: 'traceability',
      startId: args.activeStartId,
      filters,
      maxDepth: args.maxDepth,
      includeStart: args.includeStart,
    };
  }

  // related
  return {
    kind: 'related',
    startId: args.activeStartId,
    filters,
    maxDepth: args.maxDepth,
    includeStart: args.includeStart,
  };
}
