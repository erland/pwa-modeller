import { useMemo, useState } from 'react';

import type {
  AnalysisDirection,
  ElementType,
  Model,
  ModelKind,
  RelationshipType
} from '../../domain';
import { ElementChooserDialog } from '../model/pickers/ElementChooserDialog';

import { FiltersPanel } from './queryPanel/FiltersPanel';
import { QueryToolbar } from './queryPanel/QueryToolbar';
import { useAnalysisQueryOptions } from './queryPanel/useAnalysisQueryOptions';
import {
  collectFacetValues,
  collectFacetValuesConstrained,
  hasAnyFilters as computeHasAnyFilters,
  sortElementTypesForDisplay
} from './queryPanel/utils';

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
  const [chooser, setChooser] = useState<null | { which: 'start' | 'source' | 'target' }>(null);

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

  // Matrix needs all element types (not constrained by the global layer filter).
  const availableElementTypesAll = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    const types = collectFacetValues<ElementType>(model, modelKind, 'elementType');
    return sortElementTypesForDisplay(types);
  }, [hasElementTypeFacet, model, modelKind]);

  const availableElementTypesByLayer = useMemo(() => {
    if (!hasElementTypeFacet || !hasLayerFacet) return new Map<string, ElementType[]>();
    const map = new Map<string, ElementType[]>();
    for (const layer of availableLayers) {
      const types = collectFacetValuesConstrained<ElementType>(model, modelKind, 'elementType', 'archimateLayer', [layer]);
      map.set(layer, sortElementTypesForDisplay(types));
    }
    return map;
  }, [availableLayers, hasElementTypeFacet, hasLayerFacet, model, modelKind]);

  const availableRowElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (!matrixRowLayer || !hasLayerFacet) return availableElementTypesAll;
    return availableElementTypesByLayer.get(matrixRowLayer) ?? ([] as ElementType[]);
  }, [availableElementTypesAll, availableElementTypesByLayer, hasElementTypeFacet, hasLayerFacet, matrixRowLayer]);

  const availableColElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (!matrixColLayer || !hasLayerFacet) return availableElementTypesAll;
    return availableElementTypesByLayer.get(matrixColLayer) ?? ([] as ElementType[]);
  }, [availableElementTypesAll, availableElementTypesByLayer, hasElementTypeFacet, hasLayerFacet, matrixColLayer]);


  return (
    <section className="crudSection" aria-label="Analysis query">
      {mode === 'matrix' ? (
        <div className="crudHeader">
          <div>
            <p className="crudTitle">Matrix query</p>
            <p className="crudHint">Choose row/column sets in “{modelName}” and build a relationship matrix.</p>
          </div>

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
                          // If the layer constraint makes the currently selected type invalid, clear it.
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
                          // If the layer constraint makes the currently selected type invalid, clear it.
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

            <div className="toolbarGroup" style={{ minWidth: 0 }}>
              <label style={{ visibility: 'hidden' }} aria-hidden="true">
                Build
              </label>
              <button type="button" className="shellButton" disabled={!canRun} onClick={onRun}>
                Build matrix
              </button>
            </div>
          </div>
        </div>
      ) : (
        <QueryToolbar
          model={model}
          modelName={modelName}
          mode={mode}
          draftStartId={draftStartId}
          onChangeDraftStartId={onChangeDraftStartId}
          draftSourceId={draftSourceId}
          onChangeDraftSourceId={onChangeDraftSourceId}
          draftTargetId={draftTargetId}
          onChangeDraftTargetId={onChangeDraftTargetId}
          onOpenChooser={(which) => setChooser({ which })}
          canUseSelection={canUseSelection}
          onUseSelection={onUseSelection}
          canRun={canRun}
          onRun={onRun}
        />
      )}

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

      <ElementChooserDialog
        title={
          chooser?.which === 'start'
            ? 'Choose start element'
            : chooser?.which === 'source'
              ? 'Choose source element'
              : chooser?.which === 'target'
                ? 'Choose target element'
                : 'Choose element'
        }
        isOpen={!!chooser}
        model={model}
        value={
          chooser?.which === 'start'
            ? draftStartId
            : chooser?.which === 'source'
              ? draftSourceId
              : chooser?.which === 'target'
                ? draftTargetId
                : ''
        }
        onClose={() => setChooser(null)}
        onChoose={(id) => {
          if (chooser?.which === 'start') onChangeDraftStartId(id);
          else if (chooser?.which === 'source') onChangeDraftSourceId(id);
          else if (chooser?.which === 'target') onChangeDraftTargetId(id);
          setChooser(null);
        }}
      />
    </section>
  );
}
