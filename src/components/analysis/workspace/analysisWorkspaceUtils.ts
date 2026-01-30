import type { AnalysisDirection, ElementType, RelationshipType } from '../../../domain';
import type { Selection } from '../../model/selection';

import type { AnalysisMode } from '../AnalysisQueryPanel';

export function selectionToElementId(sel: Selection): string | null {
  switch (sel.kind) {
    case 'element':
      return sel.elementId;
    case 'viewNode':
      return sel.elementId;
    case 'viewNodes':
      return sel.elementIds[0] ?? null;
    case 'relationship':
      // For now we don't map relationship -> endpoint; Step 4+ can add this if desired.
      return null;
    default:
      return null;
  }
}

export function selectionToElementIds(sel: Selection): string[] {
  switch (sel.kind) {
    case 'element':
      return [sel.elementId];
    case 'viewNode':
      return [sel.elementId];
    case 'viewNodes':
      return sel.elementIds;
    default:
      return [];
  }
}

export type RelatedAnalysisOpts = {
  direction: AnalysisDirection;
  maxDepth: number;
  includeStart: boolean;
  relationshipTypes?: RelationshipType[];
  layers?: string[];
  elementTypes?: ElementType[];
};

export function buildRelatedAnalysisOpts(args: {
  direction: AnalysisDirection;
  maxDepth: number;
  includeStart: boolean;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];
}): RelatedAnalysisOpts {
  const { direction, maxDepth, includeStart, relationshipTypes, layers, elementTypes } = args;
  return {
    direction,
    maxDepth,
    includeStart,
    relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
    layers: layers.length ? layers : undefined,
    elementTypes: elementTypes.length ? elementTypes : undefined,
  };
}

export type PathsAnalysisOpts = {
  direction: AnalysisDirection;
  maxPaths: number;
  maxPathLength?: number;
  relationshipTypes?: RelationshipType[];
  layers?: string[];
  elementTypes?: ElementType[];
};

export function buildPathsAnalysisOpts(args: {
  direction: AnalysisDirection;
  maxPaths: number;
  maxPathLength: number | null;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];
}): PathsAnalysisOpts {
  const { direction, maxPaths, maxPathLength, relationshipTypes, layers, elementTypes } = args;
  return {
    direction,
    maxPaths,
    maxPathLength: maxPathLength === null ? undefined : maxPathLength,
    relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
    layers: layers.length ? layers : undefined,
    elementTypes: elementTypes.length ? elementTypes : undefined,
  };
}

export function computeCanRun(args: {
  modelPresent: boolean;
  mode: AnalysisMode;
  matrixResolvedRowCount: number;
  matrixResolvedColCount: number;
  draftStartId: string;
  draftSourceId: string;
  draftTargetId: string;
}): boolean {
  const {
    modelPresent,
    mode,
    matrixResolvedRowCount,
    matrixResolvedColCount,
    draftStartId,
    draftSourceId,
    draftTargetId,
  } = args;

  if (!modelPresent) return false;

  if (mode === 'sandbox') return false;
  if (mode === 'matrix') return matrixResolvedRowCount > 0 && matrixResolvedColCount > 0;
  if (mode === 'paths') return Boolean(draftSourceId && draftTargetId && draftSourceId !== draftTargetId);
  // related / traceability
  return Boolean(draftStartId);
}

export function computeTraceSeedId(args: {
  activeStartId: string;
  draftStartId: string;
  selection: Selection;
}): string {
  const { activeStartId, draftStartId, selection } = args;
  return activeStartId || draftStartId || selectionToElementId(selection) || '';
}
