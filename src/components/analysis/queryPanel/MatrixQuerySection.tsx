import type { ReactNode } from 'react';

import type {
  AnalysisDirection,
  ElementType,
  RelationshipType
} from '../../../domain';
import type { PathsBetweenQueryMode } from '../../../store';

import { AnalysisSection } from '../layout/AnalysisSection';
import type { MatrixQueryPreset, MatrixQuerySnapshot } from '../matrixPresetsStorage';

import { FiltersPanel } from './FiltersPanel';
import { MatrixAxesControls } from './MatrixAxesControls';
import { MatrixPresetSnapshotControls } from './MatrixPresetSnapshotControls';
import { useMatrixAxesLayerGuards } from './useMatrixAxesLayerGuards';

export type MatrixQuerySectionProps = {
  canRun: boolean;
  onRun: () => void;

  hint: ReactNode;

  // selection support
  selectionElementIds: string[];

  // row controls
  matrixRowSource: 'facet' | 'selection';
  onChangeMatrixRowSource: (v: 'facet' | 'selection') => void;
  matrixRowElementType: ElementType | '';
  onChangeMatrixRowElementType: (v: ElementType | '') => void;
  matrixRowLayer: string | '';
  onChangeMatrixRowLayer: (v: string | '') => void;
  matrixRowSelectionIds: string[];
  onCaptureMatrixRowSelection: () => void;

  // col controls
  matrixColSource: 'facet' | 'selection';
  onChangeMatrixColSource: (v: 'facet' | 'selection') => void;
  matrixColElementType: ElementType | '';
  onChangeMatrixColElementType: (v: ElementType | '') => void;
  matrixColLayer: string | '';
  onChangeMatrixColLayer: (v: string | '') => void;
  matrixColSelectionIds: string[];
  onCaptureMatrixColSelection: () => void;

  onSwapMatrixAxes: () => void;

  // facet availability
  hasLayerFacet: boolean;
  availableLayers: string[];
  availableRowElementTypes: ElementType[];
  availableColElementTypes: ElementType[];
  availableElementTypesByLayer: Map<string, ElementType[]>;

  // presets/snapshots
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

  // filters
  mode: 'matrix';
  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;

  availableRelationshipTypes: RelationshipType[];
  relationshipTypesSorted: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;

  layersSorted: string[];
  onChangeLayers: (layers: string[]) => void;

  hasElementTypeFacet: boolean;
  allowedElementTypes: ElementType[];
  elementTypesSorted: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;
  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
  hasAnyFilters: boolean;
};

export function MatrixQuerySection({
  canRun,
  onRun,
  hint,
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
  hasLayerFacet,
  availableLayers,
  availableRowElementTypes,
  availableColElementTypes,
  availableElementTypesByLayer,
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
  mode,
  direction,
  onChangeDirection,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength,
  availableRelationshipTypes,
  relationshipTypesSorted,
  onChangeRelationshipTypes,
  layersSorted,
  onChangeLayers,
  hasElementTypeFacet,
  allowedElementTypes,
  elementTypesSorted,
  onChangeElementTypes,
  onApplyPreset,
  hasAnyFilters
}: MatrixQuerySectionProps) {
  const { onChangeMatrixRowLayerGuarded, onChangeMatrixColLayerGuarded } = useMatrixAxesLayerGuards({
    matrixRowSource,
    matrixRowElementType,
    onChangeMatrixRowLayer,
    onChangeMatrixRowElementType,
    matrixColSource,
    matrixColElementType,
    onChangeMatrixColLayer,
    onChangeMatrixColElementType,
    availableElementTypesByLayer
  });

  return (
    <AnalysisSection
      title="Query"
      hint={hint}
      actions={
        <button type="button" className="shellButton" disabled={!canRun} onClick={onRun}>
          Build matrix
        </button>
      }
    >
      <MatrixAxesControls
        selectionElementIds={selectionElementIds}
        hasLayerFacet={hasLayerFacet}
        availableLayers={availableLayers}
        matrixRowSource={matrixRowSource}
        onChangeMatrixRowSource={onChangeMatrixRowSource}
        matrixRowLayer={matrixRowLayer}
        onChangeMatrixRowLayer={onChangeMatrixRowLayerGuarded}
        matrixRowElementType={matrixRowElementType}
        onChangeMatrixRowElementType={onChangeMatrixRowElementType}
        matrixRowSelectionIds={matrixRowSelectionIds}
        onCaptureMatrixRowSelection={onCaptureMatrixRowSelection}
        availableRowElementTypes={availableRowElementTypes}
        matrixColSource={matrixColSource}
        onChangeMatrixColSource={onChangeMatrixColSource}
        matrixColLayer={matrixColLayer}
        onChangeMatrixColLayer={onChangeMatrixColLayerGuarded}
        matrixColElementType={matrixColElementType}
        onChangeMatrixColElementType={onChangeMatrixColElementType}
        matrixColSelectionIds={matrixColSelectionIds}
        onCaptureMatrixColSelection={onCaptureMatrixColSelection}
        availableColElementTypes={availableColElementTypes}
        onSwapMatrixAxes={onSwapMatrixAxes}
      />

      <MatrixPresetSnapshotControls
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
      />

      <FiltersPanel
        mode={mode}
        direction={direction}
        onChangeDirection={onChangeDirection}
        maxDepth={maxDepth}
        onChangeMaxDepth={onChangeMaxDepth}
        includeStart={includeStart}
        onChangeIncludeStart={onChangeIncludeStart}
        // Matrix mode never uses the path engine selector, but FiltersPanel expects it.
        pathsMode={'shortest' as PathsBetweenQueryMode}
        onChangePathsMode={() => undefined}
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
    </AnalysisSection>
  );
}
