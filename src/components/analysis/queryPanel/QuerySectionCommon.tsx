import type { ReactNode } from 'react';

import type {
  AnalysisDirection,
  ElementType,
  Model,
  RelationshipType
} from '../../../domain';
import type { PathsBetweenQueryMode } from '../../../store';
import { AnalysisSection } from '../layout/AnalysisSection';
import { FiltersPanel } from './FiltersPanel';
import { QueryToolbar } from './QueryToolbar';

import type { AnalysisMode } from '../AnalysisQueryPanel';

export type QuerySectionCommonProps = {
  modelName: string;
  mode: Exclude<AnalysisMode, 'matrix'>;
  model: Model;
  hint: ReactNode;

  canRun: boolean;
  onRun: () => void;

  // toolbar
  draftStartId: string;
  onChangeDraftStartId: (id: string) => void;
  draftSourceId: string;
  onChangeDraftSourceId: (id: string) => void;
  draftTargetId: string;
  onChangeDraftTargetId: (id: string) => void;
  openChooser: (which: 'start' | 'source' | 'target') => void;
  canUseSelection: boolean;
  onUseSelection: (which: 'start' | 'source' | 'target') => void;

  // filters
  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;
  relationshipTypesSorted: RelationshipType[];
  availableRelationshipTypes: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;
  hasLayerFacet: boolean;
  availableLayers: string[];
  layersSorted: string[];
  onChangeLayers: (layers: string[]) => void;
  hasElementTypeFacet: boolean;
  allowedElementTypes: ElementType[];
  elementTypesSorted: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;

  // mode-specific extras
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;
  // paths-only extras
  pathsMode: PathsBetweenQueryMode;
  onChangePathsMode: (v: PathsBetweenQueryMode) => void;
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;
  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
  hasAnyFilters: boolean;

  chooserDialog: JSX.Element;
};

export function QuerySectionCommon({
  modelName,
  mode,
  model,
  hint,
  canRun,
  onRun,
  draftStartId,
  onChangeDraftStartId,
  draftSourceId,
  onChangeDraftSourceId,
  draftTargetId,
  onChangeDraftTargetId,
  openChooser,
  canUseSelection,
  onUseSelection,
  direction,
  onChangeDirection,
  relationshipTypesSorted,
  availableRelationshipTypes,
  onChangeRelationshipTypes,
  hasLayerFacet,
  availableLayers,
  layersSorted,
  onChangeLayers,
  hasElementTypeFacet,
  allowedElementTypes,
  elementTypesSorted,
  onChangeElementTypes,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart,
  pathsMode,
  onChangePathsMode,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength,
  onApplyPreset,
  hasAnyFilters,
  chooserDialog
}: QuerySectionCommonProps) {
  return (
    <AnalysisSection
      title="Query"
      hint={hint}
      actions={
        <button type="button" className="shellButton" disabled={!canRun} onClick={onRun}>
          Run analysis
        </button>
      }
    >
      <QueryToolbar
        variant="body"
        model={model}
        mode={mode}
        draftStartId={draftStartId}
        onChangeDraftStartId={onChangeDraftStartId}
        draftSourceId={draftSourceId}
        onChangeDraftSourceId={onChangeDraftSourceId}
        draftTargetId={draftTargetId}
        onChangeDraftTargetId={onChangeDraftTargetId}
        onOpenChooser={openChooser}
        canUseSelection={canUseSelection}
        onUseSelection={onUseSelection}
        canRun={canRun}
        onRun={onRun}
        modelName={modelName}

      />

      <FiltersPanel
        mode={mode}
        direction={direction}
        onChangeDirection={onChangeDirection}
        maxDepth={maxDepth}
        onChangeMaxDepth={onChangeMaxDepth}
        includeStart={includeStart}
        onChangeIncludeStart={onChangeIncludeStart}
        pathsMode={pathsMode}
        onChangePathsMode={onChangePathsMode}
        maxPaths={maxPaths}
        onChangeMaxPaths={onChangeMaxPaths}
        maxPathLength={maxPathLength}
        onChangeMaxPathLength={onChangeMaxPathLength}
        availableRelationshipTypes={availableRelationshipTypes}
        relationshipTypesSorted={relationshipTypesSorted}
        onChangeRelationshipTypes={onChangeRelationshipTypes}
        hasLayerFacet={hasLayerFacet}
        availableLayers={availableLayers}
        layersSorted={layersSorted}
        onChangeLayers={onChangeLayers}
        hasElementTypeFacet={hasElementTypeFacet}
        allowedElementTypes={allowedElementTypes}
        elementTypesSorted={elementTypesSorted}
        onChangeElementTypes={onChangeElementTypes}
        onApplyPreset={onApplyPreset}
        hasAnyFilters={hasAnyFilters}
      />

      {chooserDialog}
    </AnalysisSection>
  );
}
