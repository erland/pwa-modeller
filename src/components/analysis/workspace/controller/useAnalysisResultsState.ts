import { useMemo } from 'react';

import type { AnalysisDirection, ElementType, RelationshipType } from '../../../../domain';
import type { PathsBetweenQueryMode } from '../../../../store';
import { useAnalysisPathsBetween, useAnalysisRelatedElements } from '../../../../store';

import { buildPathsAnalysisOpts, buildRelatedAnalysisOpts } from '../analysisWorkspaceUtils';

export function useAnalysisResultsState(args: {
  // Active element selection drives the actual result queries.
  activeStartId: string;
  activeSourceId: string;
  activeTargetId: string;

  // Filters (draft) affect query shape.
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];

  // Related
  maxDepth: number;
  includeStart: boolean;

  // Paths
  maxPaths: number;
  maxPathLength: number | null;

  // Paths mode (opt-in)
  pathsMode?: PathsBetweenQueryMode;
}) {
  const {
    activeStartId,
    activeSourceId,
    activeTargetId,
    direction,
    relationshipTypes,
    layers,
    elementTypes,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength,
    pathsMode,
  } = args;

  const relatedOpts = useMemo(
    () =>
      buildRelatedAnalysisOpts({
        direction,
        maxDepth,
        includeStart,
        relationshipTypes,
        layers,
        elementTypes,
      }),
    [direction, maxDepth, includeStart, relationshipTypes, layers, elementTypes]
  );

  const pathsOpts = useMemo(
    () =>
      buildPathsAnalysisOpts({
        direction,
        maxPaths,
        maxPathLength,
        relationshipTypes,
        layers,
        elementTypes,
      }),
    [direction, maxPaths, maxPathLength, relationshipTypes, layers, elementTypes]
  );

  // Results are driven by active element selection + *draft* filters (QoL).
  const relatedResult = useAnalysisRelatedElements(activeStartId || null, relatedOpts);
  const pathsResult = useAnalysisPathsBetween(activeSourceId || null, activeTargetId || null, pathsOpts, pathsMode ?? 'shortest');

  return { relatedOpts, pathsOpts, relatedResult, pathsResult } as const;
}
