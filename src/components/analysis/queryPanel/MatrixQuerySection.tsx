import type { ReactNode } from 'react';

import type {
  AnalysisDirection,
  ElementType,
  RelationshipType
} from '../../../domain';

import { AnalysisSection } from '../layout/AnalysisSection';
import type { MatrixQueryPreset, MatrixQuerySnapshot } from '../matrixPresetsStorage';

import { FiltersPanel } from './FiltersPanel';

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
      <div className="toolbar" aria-label="Matrix query toolbar">
        <div className="toolbarGroup" style={{ minWidth: 260 }}>
          <label>Rows</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="selectInput"
              value={matrixRowSource}
              onChange={(e) => onChangeMatrixRowSource(e.currentTarget.value as 'facet' | 'selection')}
              title="How to pick row elements"
            >
              <option value="facet">By type/layer</option>
              <option value="selection">Current selection</option>
            </select>
            {matrixRowSource === 'facet' ? (
              <>
                {hasLayerFacet ? (
                  <select
                    className="selectInput"
                    value={matrixRowLayer}
                    onChange={(e) => {
                      const nextLayer = e.currentTarget.value;
                      onChangeMatrixRowLayer(nextLayer);
                      if (
                        nextLayer &&
                        matrixRowElementType &&
                        !availableElementTypesByLayer.get(nextLayer)?.includes(matrixRowElementType)
                      ) {
                        onChangeMatrixRowElementType('');
                      }
                    }}
                    title="Optional layer constraint"
                  >
                    <option value="">Any layer</option>
                    {availableLayers.map((l) => (
                      <option key={l} value={l}>
                        {String(l)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  className="selectInput"
                  value={matrixRowElementType}
                  onChange={(e) => onChangeMatrixRowElementType(e.currentTarget.value as ElementType | '')}
                  title="Row element type"
                >
                  <option value="">Select type…</option>
                  {availableRowElementTypes.map((t) => (
                    <option key={t} value={t}>
                      {String(t)}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={onCaptureMatrixRowSelection}
                  disabled={selectionElementIds.length === 0}
                  title="Use currently selected element(s) as rows"
                >
                  Use selection
                </button>
                <span className="crudHint" style={{ margin: 0 }}>
                  {matrixRowSelectionIds.length ? `${matrixRowSelectionIds.length} selected` : 'No rows selected'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 0 }}>
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Swap
          </label>
          <button
            type="button"
            className="shellButton"
            onClick={onSwapMatrixAxes}
            title="Swap row and column selections"
          >
            ⇄ Swap
          </button>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 260 }}>
          <label>Columns</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="selectInput"
              value={matrixColSource}
              onChange={(e) => onChangeMatrixColSource(e.currentTarget.value as 'facet' | 'selection')}
              title="How to pick column elements"
            >
              <option value="facet">By type/layer</option>
              <option value="selection">Current selection</option>
            </select>
            {matrixColSource === 'facet' ? (
              <>
                {hasLayerFacet ? (
                  <select
                    className="selectInput"
                    value={matrixColLayer}
                    onChange={(e) => {
                      const nextLayer = e.currentTarget.value;
                      onChangeMatrixColLayer(nextLayer);
                      if (
                        nextLayer &&
                        matrixColElementType &&
                        !availableElementTypesByLayer.get(nextLayer)?.includes(matrixColElementType)
                      ) {
                        onChangeMatrixColElementType('');
                      }
                    }}
                    title="Optional layer constraint"
                  >
                    <option value="">Any layer</option>
                    {availableLayers.map((l) => (
                      <option key={l} value={l}>
                        {String(l)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  className="selectInput"
                  value={matrixColElementType}
                  onChange={(e) => onChangeMatrixColElementType(e.currentTarget.value as ElementType | '')}
                  title="Column element type"
                >
                  <option value="">Select type…</option>
                  {availableColElementTypes.map((t) => (
                    <option key={t} value={t}>
                      {String(t)}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={onCaptureMatrixColSelection}
                  disabled={selectionElementIds.length === 0}
                  title="Use currently selected element(s) as columns"
                >
                  Use selection
                </button>
                <span className="crudHint" style={{ margin: 0 }}>
                  {matrixColSelectionIds.length ? `${matrixColSelectionIds.length} selected` : 'No columns selected'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="toolbar" aria-label="Matrix presets toolbar" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <div className="toolbarGroup" style={{ minWidth: 220 }}>
          <label htmlFor="matrix-preset">Preset</label>
          <select
            id="matrix-preset"
            className="selectInput"
            value={matrixPresetId}
            onChange={(e) => onChangeMatrixPresetId(e.target.value)}
          >
            <option value="">(none)</option>
            {matrixPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbarGroup">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Actions
          </label>
          <button type="button" className="shellButton" onClick={onSaveMatrixPreset}>
            Save preset
          </button>
        </div>

        <div className="toolbarGroup">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Apply
          </label>
          <button type="button" className="shellButton" disabled={!matrixPresetId} onClick={onApplyMatrixPreset}>
            Apply
          </button>
        </div>

        <div className="toolbarGroup">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Delete
          </label>
          <button type="button" className="shellButton" disabled={!matrixPresetId} onClick={onDeleteMatrixPreset}>
            Delete
          </button>
        </div>

        <div className="toolbarGroup">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Snapshot
          </label>
          <button type="button" className="shellButton" disabled={!canSaveMatrixSnapshot} onClick={onSaveMatrixSnapshot}>
            Save snapshot
          </button>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 240 }}>
          <label htmlFor="matrix-snapshot">Snapshot</label>
          <select
            id="matrix-snapshot"
            className="selectInput"
            value={matrixSnapshotId}
            onChange={(e) => onChangeMatrixSnapshotId(e.target.value)}
          >
            <option value="">(none)</option>
            {matrixSnapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbarGroup">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Restore
          </label>
          <button type="button" className="shellButton" disabled={!matrixSnapshotId} onClick={onRestoreMatrixSnapshot}>
            Restore
          </button>
        </div>

        <div className="toolbarGroup">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Delete snapshot
          </label>
          <button type="button" className="shellButton" disabled={!matrixSnapshotId} onClick={onDeleteMatrixSnapshot}>
            Delete snapshot
          </button>
        </div>
      </div>

      <FiltersPanel
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
