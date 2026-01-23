import { useState } from 'react';

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
import { hasAnyFilters as computeHasAnyFilters } from './queryPanel/utils';

export type AnalysisMode = 'related' | 'paths' | 'traceability';

type Props = {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;
  onChangeMode: (mode: AnalysisMode) => void;

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
  onChangeMode,
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

  return (
    <section className="crudSection" aria-label="Analysis query">
      <QueryToolbar
        model={model}
        modelName={modelName}
        mode={mode}
        onChangeMode={onChangeMode}
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
