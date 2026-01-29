import { useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, RelationshipType } from '../../../../domain';
import type { AnalysisMode } from '../../AnalysisQueryPanel';

export type AnalysisGlobalFiltersState = {
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];
  maxDepth: number;
  includeStart: boolean;
  maxPaths: number;
  maxPathLength: number | null;
};

export type AnalysisGlobalFiltersActions = {
  setDirection: (v: AnalysisDirection) => void;
  setRelationshipTypes: (v: RelationshipType[]) => void;
  setLayers: (v: string[]) => void;
  setElementTypes: (v: ElementType[]) => void;
  setMaxDepth: (v: number) => void;
  setIncludeStart: (v: boolean) => void;
  setMaxPaths: (v: number) => void;
  setMaxPathLength: (v: number | null) => void;
};

export const DEFAULT_ANALYSIS_FILTERS: Readonly<AnalysisGlobalFiltersState> = {
  direction: 'both',
  relationshipTypes: [],
  layers: [],
  elementTypes: [],
  maxDepth: 4,
  includeStart: false,
  maxPaths: 10,
  maxPathLength: null,
};

/**
 * Owns the global filter state used by analysis modes.
 *
 * Note: It also contains the small UX rule that entering Traceability mode nudges maxDepth to 1
 * when maxDepth is still at the default (4).
 */
export function useAnalysisGlobalFiltersState(mode: AnalysisMode) {
  const [direction, setDirection] = useState<AnalysisDirection>(DEFAULT_ANALYSIS_FILTERS.direction);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>(DEFAULT_ANALYSIS_FILTERS.relationshipTypes);
  const [layers, setLayers] = useState<string[]>(DEFAULT_ANALYSIS_FILTERS.layers);
  const [elementTypes, setElementTypes] = useState<ElementType[]>(DEFAULT_ANALYSIS_FILTERS.elementTypes);
  const [maxDepth, setMaxDepth] = useState<number>(DEFAULT_ANALYSIS_FILTERS.maxDepth);
  const [includeStart, setIncludeStart] = useState<boolean>(DEFAULT_ANALYSIS_FILTERS.includeStart);
  const [maxPaths, setMaxPaths] = useState<number>(DEFAULT_ANALYSIS_FILTERS.maxPaths);
  const [maxPathLength, setMaxPathLength] = useState<number | null>(DEFAULT_ANALYSIS_FILTERS.maxPathLength);

  // Traceability: default to 1-hop expansion when entering explorer mode.
  useEffect(() => {
    if (mode !== 'traceability') return;
    // Only auto-adjust when still at the global default (4) to avoid overriding user intent.
    if (maxDepth === DEFAULT_ANALYSIS_FILTERS.maxDepth) setMaxDepth(1);
  }, [mode, maxDepth]);

  const state: AnalysisGlobalFiltersState = useMemo(
    () => ({
      direction,
      relationshipTypes,
      layers,
      elementTypes,
      maxDepth,
      includeStart,
      maxPaths,
      maxPathLength,
    }),
    [direction, elementTypes, includeStart, layers, maxDepth, maxPathLength, maxPaths, relationshipTypes]
  );

  const actions: AnalysisGlobalFiltersActions = useMemo(
    () => ({
      setDirection,
      setRelationshipTypes,
      setLayers,
      setElementTypes,
      setMaxDepth,
      setIncludeStart,
      setMaxPaths,
      setMaxPathLength,
    }),
    []
  );

  return { state, actions } as const;
}
