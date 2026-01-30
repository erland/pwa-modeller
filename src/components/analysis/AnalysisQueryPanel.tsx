import { useMemo } from 'react';

import type {
  AnalysisDirection,
  ElementType,
  Model,
  ModelKind,
  RelationshipType
} from '../../domain';

import type { PathsBetweenQueryMode } from '../../store';

import type { MatrixQueryPreset, MatrixQuerySnapshot } from './matrixPresetsStorage';
import { QuerySectionCommon } from './queryPanel/QuerySectionCommon';
import { MatrixQuerySection } from './queryPanel/MatrixQuerySection';
import { useAnalysisQueryOptions } from './queryPanel/useAnalysisQueryOptions';
import { useElementChooser } from './queryPanel/useElementChooser';
import { useMatrixFacetOptions } from './queryPanel/useMatrixFacetOptions';
import { hasAnyFilters as computeHasAnyFilters } from './queryPanel/utils';

export type AnalysisMode = 'related' | 'paths' | 'traceability' | 'matrix' | 'portfolio';

export type AnalysisQueryPanelState = {
  mode: AnalysisMode;
  selectionElementIds: string[];

  draft: {
    startId: string;
    sourceId: string;
    targetId: string;
  };

  filters: {
    direction: AnalysisDirection;
    relationshipTypes: RelationshipType[];
    layers: string[];
    elementTypes: ElementType[];
    maxDepth: number;
    includeStart: boolean;
    maxPaths: number;
    maxPathLength: number | null;
    // Opt-in: selects which path engine is used for Paths mode.
    pathsMode: PathsBetweenQueryMode;
  };

  matrix: {
    rowSource: 'facet' | 'selection';
    rowElementType: ElementType | '';
    rowLayer: string | '';
    rowSelectionIds: string[];

    colSource: 'facet' | 'selection';
    colElementType: ElementType | '';
    colLayer: string | '';
    colSelectionIds: string[];

    resolvedRowCount: number;
    resolvedColCount: number;
    hasBuilt: boolean;
    buildNonce: number;

    presets: MatrixQueryPreset[];
    presetId: string;

    snapshots: MatrixQuerySnapshot[];
    snapshotId: string;
    canSaveSnapshot: boolean;
  };
};

export type AnalysisQueryPanelActions = {
  setMode: (mode: AnalysisMode) => void;

  draft: {
    setStartId: (id: string) => void;
    setSourceId: (id: string) => void;
    setTargetId: (id: string) => void;
    useSelection: (which: 'start' | 'source' | 'target') => void;
  };

  filters: {
    setDirection: (dir: AnalysisDirection) => void;
    setRelationshipTypes: (types: RelationshipType[]) => void;
    setLayers: (layers: string[]) => void;
    setElementTypes: (types: ElementType[]) => void;
    setMaxDepth: (n: number) => void;
    setIncludeStart: (v: boolean) => void;
    setMaxPaths: (n: number) => void;
    setMaxPathLength: (n: number | null) => void;
    setPathsMode: (v: PathsBetweenQueryMode) => void;
    applyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
  };

  matrix: {
    setRowSource: (v: 'facet' | 'selection') => void;
    setRowElementType: (v: ElementType | '') => void;
    setRowLayer: (v: string | '') => void;
    setRowSelectionIds: (ids: string[]) => void;
    captureRowSelection: () => void;

    setColSource: (v: 'facet' | 'selection') => void;
    setColElementType: (v: ElementType | '') => void;
    setColLayer: (v: string | '') => void;
    setColSelectionIds: (ids: string[]) => void;
    captureColSelection: () => void;

    swapAxes: () => void;

    setPresetId: (id: string) => void;
    savePreset: () => void;
    applySelectedPreset: () => void;
    deleteSelectedPreset: () => void;

    setSnapshotId: (id: string) => void;
    saveSnapshot: () => void;
    restoreSelectedSnapshot: () => void;
    deleteSelectedSnapshot: () => void;
  };

  run: () => void;
};

export type AnalysisQueryPanelMeta = {
  canUseSelection: boolean;
  canRun: boolean;
};

type Props = {
  model: Model;
  modelKind: ModelKind;
  state: AnalysisQueryPanelState;
  actions: AnalysisQueryPanelActions;
  meta: AnalysisQueryPanelMeta;
};

export function AnalysisQueryPanel({
  model,
  modelKind,
  state,
  actions,
  meta
}: Props) {
  const { mode, selectionElementIds, draft, filters, matrix } = state;
  const { canRun, canUseSelection } = meta;

  const {
    run: onRun,
    draft: draftActions,
    filters: filterActions,
    matrix: matrixActions
  } = actions;

  const {
    direction,
    relationshipTypes,
    layers,
    elementTypes,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength,
    pathsMode
  } = filters;

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
    onChangeRelationshipTypes: filterActions.setRelationshipTypes,
    layers,
    onChangeLayers: filterActions.setLayers,
    elementTypes,
    onChangeElementTypes: filterActions.setElementTypes
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
    draftStartId: draft.startId,
    onChangeDraftStartId: draftActions.setStartId,
    draftSourceId: draft.sourceId,
    onChangeDraftSourceId: draftActions.setSourceId,
    draftTargetId: draft.targetId,
    onChangeDraftTargetId: draftActions.setTargetId
  });

  const { availableElementTypesByLayer, availableRowElementTypes, availableColElementTypes } = useMatrixFacetOptions({
    model,
    modelKind,
    hasLayerFacet,
    hasElementTypeFacet,
    availableLayers,
    matrixRowLayer: matrix.rowLayer,
    matrixColLayer: matrix.colLayer
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
        <span className="mono">{matrix.resolvedRowCount}</span>, Columns:{' '}
        <span className="mono">{matrix.resolvedColCount}</span>.{' '}
        {matrix.hasBuilt ? (
          <>
            Last build: <span className="mono">{matrix.buildNonce}</span>.
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
        matrixRowSource={matrix.rowSource}
        onChangeMatrixRowSource={matrixActions.setRowSource}
        matrixRowElementType={matrix.rowElementType}
        onChangeMatrixRowElementType={matrixActions.setRowElementType}
        matrixRowLayer={matrix.rowLayer}
        onChangeMatrixRowLayer={matrixActions.setRowLayer}
        matrixRowSelectionIds={matrix.rowSelectionIds}
        onCaptureMatrixRowSelection={matrixActions.captureRowSelection}
        matrixColSource={matrix.colSource}
        onChangeMatrixColSource={matrixActions.setColSource}
        matrixColElementType={matrix.colElementType}
        onChangeMatrixColElementType={matrixActions.setColElementType}
        matrixColLayer={matrix.colLayer}
        onChangeMatrixColLayer={matrixActions.setColLayer}
        matrixColSelectionIds={matrix.colSelectionIds}
        onCaptureMatrixColSelection={matrixActions.captureColSelection}
        onSwapMatrixAxes={matrixActions.swapAxes}
        hasLayerFacet={hasLayerFacet}
        availableLayers={availableLayers}
        availableRowElementTypes={availableRowElementTypes}
        availableColElementTypes={availableColElementTypes}
        availableElementTypesByLayer={availableElementTypesByLayer}
        matrixPresets={matrix.presets}
        matrixPresetId={matrix.presetId}
        onChangeMatrixPresetId={matrixActions.setPresetId}
        onSaveMatrixPreset={matrixActions.savePreset}
        onApplyMatrixPreset={matrixActions.applySelectedPreset}
        onDeleteMatrixPreset={matrixActions.deleteSelectedPreset}
        matrixSnapshots={matrix.snapshots}
        matrixSnapshotId={matrix.snapshotId}
        onChangeMatrixSnapshotId={matrixActions.setSnapshotId}
        canSaveMatrixSnapshot={matrix.canSaveSnapshot}
        onSaveMatrixSnapshot={matrixActions.saveSnapshot}
        onRestoreMatrixSnapshot={matrixActions.restoreSelectedSnapshot}
        onDeleteMatrixSnapshot={matrixActions.deleteSelectedSnapshot}
        mode={mode}
        direction={direction}
        onChangeDirection={filterActions.setDirection}
        maxDepth={maxDepth}
        onChangeMaxDepth={filterActions.setMaxDepth}
        includeStart={includeStart}
        onChangeIncludeStart={filterActions.setIncludeStart}
        maxPaths={maxPaths}
        onChangeMaxPaths={filterActions.setMaxPaths}
        maxPathLength={maxPathLength}
        onChangeMaxPathLength={filterActions.setMaxPathLength}
        availableRelationshipTypes={availableRelationshipTypes}
        relationshipTypesSorted={relationshipTypesSorted}
        onChangeRelationshipTypes={filterActions.setRelationshipTypes}
        layersSorted={layersSorted}
        onChangeLayers={filterActions.setLayers}
        hasElementTypeFacet={hasElementTypeFacet}
        allowedElementTypes={allowedElementTypes}
        elementTypesSorted={elementTypesSorted}
        onChangeElementTypes={filterActions.setElementTypes}
        onApplyPreset={filterActions.applyPreset}
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
      draftStartId={draft.startId}
      onChangeDraftStartId={draftActions.setStartId}
      draftSourceId={draft.sourceId}
      onChangeDraftSourceId={draftActions.setSourceId}
      draftTargetId={draft.targetId}
      onChangeDraftTargetId={draftActions.setTargetId}
      openChooser={openChooser}
      canUseSelection={canUseSelection}
      onUseSelection={draftActions.useSelection}
      direction={direction}
      onChangeDirection={filterActions.setDirection}
      relationshipTypesSorted={relationshipTypesSorted}
      availableRelationshipTypes={availableRelationshipTypes}
      onChangeRelationshipTypes={filterActions.setRelationshipTypes}
      hasLayerFacet={hasLayerFacet}
      availableLayers={availableLayers}
      layersSorted={layersSorted}
      onChangeLayers={filterActions.setLayers}
      hasElementTypeFacet={hasElementTypeFacet}
      allowedElementTypes={allowedElementTypes}
      elementTypesSorted={elementTypesSorted}
      onChangeElementTypes={filterActions.setElementTypes}
      maxDepth={maxDepth}
      onChangeMaxDepth={filterActions.setMaxDepth}
      includeStart={includeStart}
      onChangeIncludeStart={filterActions.setIncludeStart}
      pathsMode={pathsMode}
      onChangePathsMode={filterActions.setPathsMode}
      maxPaths={maxPaths}
      onChangeMaxPaths={filterActions.setMaxPaths}
      maxPathLength={maxPathLength}
      onChangeMaxPathLength={filterActions.setMaxPathLength}
      onApplyPreset={filterActions.applyPreset}
      hasAnyFilters={hasAnyFilters}
      chooserDialog={chooserDialog}
    />
  );
}
