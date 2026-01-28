import { useMemo } from 'react';

import type {
  AnalysisDirection,
  ElementType,
  Model,
  ModelKind,
  RelationshipType
} from '../../domain';

import type { MatrixQueryPreset, MatrixQuerySnapshot } from './matrixPresetsStorage';
import { QuerySectionCommon } from './queryPanel/QuerySectionCommon';
import { MatrixQuerySection } from './queryPanel/MatrixQuerySection';
import { useAnalysisQueryOptions } from './queryPanel/useAnalysisQueryOptions';
import { useElementChooser } from './queryPanel/useElementChooser';
import { useMatrixFacetOptions } from './queryPanel/useMatrixFacetOptions';
import { hasAnyFilters as computeHasAnyFilters } from './queryPanel/utils';

export type AnalysisMode = 'related' | 'paths' | 'traceability' | 'matrix' | 'portfolio';

type Props = {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;

  // -----------------------------
  // Matrix (draft)
  // -----------------------------
  selectionElementIds: string[];

  matrixRowSource: 'facet' | 'selection';
  onChangeMatrixRowSource: (v: 'facet' | 'selection') => void;
  matrixRowElementType: ElementType | '';
  onChangeMatrixRowElementType: (v: ElementType | '') => void;
  matrixRowLayer: string | '';
  onChangeMatrixRowLayer: (v: string | '') => void;
  matrixRowSelectionIds: string[];
  onCaptureMatrixRowSelection: () => void;

  matrixColSource: 'facet' | 'selection';
  onChangeMatrixColSource: (v: 'facet' | 'selection') => void;
  matrixColElementType: ElementType | '';
  onChangeMatrixColElementType: (v: ElementType | '') => void;
  matrixColLayer: string | '';
  onChangeMatrixColLayer: (v: string | '') => void;
  matrixColSelectionIds: string[];
  onCaptureMatrixColSelection: () => void;

  onSwapMatrixAxes: () => void;

  // Matrix query UI extras (presets/snapshots + status)
  matrixResolvedRowCount: number;
  matrixResolvedColCount: number;
  matrixHasBuilt: boolean;
  matrixBuildNonce: number;

  matrixPresets: MatrixQueryPreset[];
  matrixPresetId: string;
  onChangeMatrixPresetId: (id: string) => void;
  onSaveMatrixPreset: () => void;
  onApplyMatrixPreset: () => void;
  onDeleteMatrixPreset: () => void;

  matrixSnapshots: MatrixQuerySnapshot[];
  matrixSnapshotId: string;
  onChangeMatrixSnapshotId: (id: string) => void;
  canSaveMatrixSnapshot: boolean;
  onSaveMatrixSnapshot: () => void;
  onRestoreMatrixSnapshot: () => void;
  onDeleteMatrixSnapshot: () => void;

  // -----------------------------
  // Filters (draft)
  // -----------------------------
  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;
  relationshipTypes: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;
  layers: string[];
  onChangeLayers: (layers: string[]) => void;

  // Related-only (refine within selected layers)
  elementTypes: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;

  // Related-only
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;

  // Paths-only
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;

  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;

  draftStartId: string;
  onChangeDraftStartId: (id: string) => void;

  draftSourceId: string;
  onChangeDraftSourceId: (id: string) => void;

  draftTargetId: string;
  onChangeDraftTargetId: (id: string) => void;

  canUseSelection: boolean;
  onUseSelection: (which: 'start' | 'source' | 'target') => void;

  canRun: boolean;
  onRun: () => void;
};

export function AnalysisQueryPanel({
  model,
  modelKind,
  mode,
  selectionElementIds,
  matrixRowSource,
  onChangeMatrixRowSource,
  matrixRowElementType,
  onChangeMatrixRowElementType,
  matrixRowLayer,
  onChangeMatrixRowLayer,
  matrixRowSelectionIds,
  onCaptureMatrixRowSelection,
  matrixColSource,
  onChangeMatrixColSource,
  matrixColElementType,
  onChangeMatrixColElementType,
  matrixColLayer,
  onChangeMatrixColLayer,
  matrixColSelectionIds,
  onCaptureMatrixColSelection,
  onSwapMatrixAxes,
  matrixResolvedRowCount,
  matrixResolvedColCount,
  matrixHasBuilt,
  matrixBuildNonce,
  matrixPresets,
  matrixPresetId,
  onChangeMatrixPresetId,
  onSaveMatrixPreset,
  onApplyMatrixPreset,
  onDeleteMatrixPreset,
  matrixSnapshots,
  matrixSnapshotId,
  onChangeMatrixSnapshotId,
  canSaveMatrixSnapshot,
  onSaveMatrixSnapshot,
  onRestoreMatrixSnapshot,
  onDeleteMatrixSnapshot,
  direction,
  onChangeDirection,
  relationshipTypes,
  onChangeRelationshipTypes,
  layers,
  onChangeLayers,
  elementTypes,
  onChangeElementTypes,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength,
  onApplyPreset,
  draftStartId,
  onChangeDraftStartId,
  draftSourceId,
  onChangeDraftSourceId,
  draftTargetId,
  onChangeDraftTargetId,
  canUseSelection,
  onUseSelection,
  canRun,
  onRun
}: Props) {
  const {
    modelName,
    hasLayerFacet,
    hasElementTypeFacet,
    availableRelationshipTypes,
    availableLayers,
    allowedElementTypes,
    relationshipTypesSorted,
    layersSorted,
    elementTypesSorted
  } = useAnalysisQueryOptions({
    model,
    modelKind,
    mode,
    relationshipTypes,
    onChangeRelationshipTypes,
    layers,
    onChangeLayers,
    elementTypes,
    onChangeElementTypes
  });

  const hasAnyFilters = computeHasAnyFilters({
    mode,
    relationshipTypesSorted,
    layersSorted,
    elementTypesSorted,
    direction,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength
  });

  const { openChooser, chooserDialog } = useElementChooser({
    model,
    draftStartId,
    onChangeDraftStartId,
    draftSourceId,
    onChangeDraftSourceId,
    draftTargetId,
    onChangeDraftTargetId
  });

  const { availableElementTypesByLayer, availableRowElementTypes, availableColElementTypes } = useMatrixFacetOptions({
    model,
    modelKind,
    hasLayerFacet,
    hasElementTypeFacet,
    availableLayers,
    matrixRowLayer,
    matrixColLayer
  });

  const commonHint = useMemo(() => {
    if (mode === 'traceability') {
      return `Pick a start element in “${modelName}” and open the traceability explorer.`;
    }
    return `Pick elements in “${modelName}” and run an analysis.`;
  }, [mode, modelName]);

  if (mode === 'matrix') {
    const matrixHint = (
      <>
        Choose row/column sets in “{modelName}” and build a relationship matrix. Rows:{' '}
        <span className="mono">{matrixResolvedRowCount}</span>, Columns:{' '}
        <span className="mono">{matrixResolvedColCount}</span>.{' '}
        {matrixHasBuilt ? (
          <>
            Last build: <span className="mono">{matrixBuildNonce}</span>.
          </>
        ) : (
          <>No matrix built yet.</>
        )}
      </>
    );

    return (
      <MatrixQuerySection
        canRun={canRun}
        onRun={onRun}
        hint={matrixHint}
        selectionElementIds={selectionElementIds}
        matrixRowSource={matrixRowSource}
        onChangeMatrixRowSource={onChangeMatrixRowSource}
        matrixRowElementType={matrixRowElementType}
        onChangeMatrixRowElementType={onChangeMatrixRowElementType}
        matrixRowLayer={matrixRowLayer}
        onChangeMatrixRowLayer={onChangeMatrixRowLayer}
        matrixRowSelectionIds={matrixRowSelectionIds}
        onCaptureMatrixRowSelection={onCaptureMatrixRowSelection}
        matrixColSource={matrixColSource}
        onChangeMatrixColSource={onChangeMatrixColSource}
        matrixColElementType={matrixColElementType}
        onChangeMatrixColElementType={onChangeMatrixColElementType}
        matrixColLayer={matrixColLayer}
        onChangeMatrixColLayer={onChangeMatrixColLayer}
        matrixColSelectionIds={matrixColSelectionIds}
        onCaptureMatrixColSelection={onCaptureMatrixColSelection}
        onSwapMatrixAxes={onSwapMatrixAxes}
        hasLayerFacet={hasLayerFacet}
        availableLayers={availableLayers}
        availableRowElementTypes={availableRowElementTypes}
        availableColElementTypes={availableColElementTypes}
        availableElementTypesByLayer={availableElementTypesByLayer}
        matrixPresets={matrixPresets}
        matrixPresetId={matrixPresetId}
        onChangeMatrixPresetId={onChangeMatrixPresetId}
        onSaveMatrixPreset={onSaveMatrixPreset}
        onApplyMatrixPreset={onApplyMatrixPreset}
        onDeleteMatrixPreset={onDeleteMatrixPreset}
        matrixSnapshots={matrixSnapshots}
        matrixSnapshotId={matrixSnapshotId}
        onChangeMatrixSnapshotId={onChangeMatrixSnapshotId}
        canSaveMatrixSnapshot={canSaveMatrixSnapshot}
        onSaveMatrixSnapshot={onSaveMatrixSnapshot}
        onRestoreMatrixSnapshot={onRestoreMatrixSnapshot}
        onDeleteMatrixSnapshot={onDeleteMatrixSnapshot}
        mode={mode}
        direction={direction}
        onChangeDirection={onChangeDirection}
        maxDepth={maxDepth}
        onChangeMaxDepth={onChangeMaxDepth}
        includeStart={includeStart}
        onChangeIncludeStart={onChangeIncludeStart}
        maxPaths={maxPaths}
        onChangeMaxPaths={onChangeMaxPaths}
        maxPathLength={maxPathLength}
        onChangeMaxPathLength={onChangeMaxPathLength}
        availableRelationshipTypes={availableRelationshipTypes}
        relationshipTypesSorted={relationshipTypesSorted}
        onChangeRelationshipTypes={onChangeRelationshipTypes}
        layersSorted={layersSorted}
        onChangeLayers={onChangeLayers}
        hasElementTypeFacet={hasElementTypeFacet}
        allowedElementTypes={allowedElementTypes}
        elementTypesSorted={elementTypesSorted}
        onChangeElementTypes={onChangeElementTypes}
        onApplyPreset={onApplyPreset}
        hasAnyFilters={hasAnyFilters}
      />
    );
  }

  return (
    <QuerySectionCommon
        modelName={modelName}
      mode={mode}
      model={model}
      hint={commonHint}
      canRun={canRun}
      onRun={onRun}
      draftStartId={draftStartId}
      onChangeDraftStartId={onChangeDraftStartId}
      draftSourceId={draftSourceId}
      onChangeDraftSourceId={onChangeDraftSourceId}
      draftTargetId={draftTargetId}
      onChangeDraftTargetId={onChangeDraftTargetId}
      openChooser={openChooser}
      canUseSelection={canUseSelection}
      onUseSelection={onUseSelection}
      direction={direction}
      onChangeDirection={onChangeDirection}
      relationshipTypesSorted={relationshipTypesSorted}
      availableRelationshipTypes={availableRelationshipTypes}
      onChangeRelationshipTypes={onChangeRelationshipTypes}
      hasLayerFacet={hasLayerFacet}
      availableLayers={availableLayers}
      layersSorted={layersSorted}
      onChangeLayers={onChangeLayers}
      hasElementTypeFacet={hasElementTypeFacet}
      allowedElementTypes={allowedElementTypes}
      elementTypesSorted={elementTypesSorted}
      onChangeElementTypes={onChangeElementTypes}
      maxDepth={maxDepth}
      onChangeMaxDepth={onChangeMaxDepth}
      includeStart={includeStart}
      onChangeIncludeStart={onChangeIncludeStart}
      maxPaths={maxPaths}
      onChangeMaxPaths={onChangeMaxPaths}
      maxPathLength={maxPathLength}
      onChangeMaxPathLength={onChangeMaxPathLength}
      onApplyPreset={onApplyPreset}
      hasAnyFilters={hasAnyFilters}
      chooserDialog={chooserDialog}
    />
  );
}
