import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, ElementType, ModelKind, RelationshipType } from '../../domain';
import type { Selection } from '../model/selection';
import { useModelStore, useAnalysisPathsBetween, useAnalysisRelatedElements } from '../../store';

import '../../styles/crud.css';

import { AnalysisQueryPanel, type AnalysisMode } from './AnalysisQueryPanel';
import { AnalysisResultTable } from './AnalysisResultTable';
import { TraceabilityExplorer } from './TraceabilityExplorer';
import { PortfolioAnalysisView } from './PortfolioAnalysisView';
import { RelationshipMatrixTable } from './RelationshipMatrixTable';
import { RelationshipMatrixCellDialog } from './RelationshipMatrixCellDialog';

import { AnalysisWorkspaceHeader } from './workspace/AnalysisWorkspaceHeader';
import { useMatrixWorkspaceState } from './workspace/useMatrixWorkspaceState';

function selectionToElementId(sel: Selection): string | null {
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

function selectionToElementIds(sel: Selection): string[] {
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

export function AnalysisWorkspace({
  modelKind,
  selection,
  onSelect
}: {
  modelKind: ModelKind;
  selection: Selection;
  onSelect: (sel: Selection) => void;
}) {
  const model = useModelStore((s) => s.model);
  const modelId = model?.id ?? '';

  const [mode, setMode] = useState<AnalysisMode>('related');

  // -----------------------------
  // Global filters (draft)
  // -----------------------------
  const [direction, setDirection] = useState<AnalysisDirection>('both');
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [layers, setLayers] = useState<string[]>([]);
  const [elementTypes, setElementTypes] = useState<ElementType[]>([]);

  // Related-only
  const [maxDepth, setMaxDepth] = useState<number>(4);

  // Traceability: default to 1-hop expansion when entering explorer mode.
  useEffect(() => {
    if (mode !== 'traceability') return;
    // Only auto-adjust when still at the global default (4) to avoid overriding user intent.
    if (maxDepth === 4) setMaxDepth(1);
  }, [mode, maxDepth]);

  const [includeStart, setIncludeStart] = useState<boolean>(false);

  // Paths-only
  const [maxPaths, setMaxPaths] = useState<number>(10);
  const [maxPathLength, setMaxPathLength] = useState<number | null>(null);

  // Draft inputs (user edits these).
  const [draftStartId, setDraftStartId] = useState<string>('');
  const [draftSourceId, setDraftSourceId] = useState<string>('');
  const [draftTargetId, setDraftTargetId] = useState<string>('');

  // Active ids (used for the current computed result).
  const [activeStartId, setActiveStartId] = useState<string>('');
  const [activeSourceId, setActiveSourceId] = useState<string>('');
  const [activeTargetId, setActiveTargetId] = useState<string>('');

  // Keep "Start element" (Related/Traceability) and "Source" (Connection between two) in sync.
  // This makes it easy to switch between views without having to re-pick the baseline element.
  const onChangeDraftStartIdSync = useCallback((id: string) => {
    setDraftStartId(id);
    setDraftSourceId(id);
  }, []);

  const onChangeDraftSourceIdSync = useCallback((id: string) => {
    setDraftSourceId(id);
    setDraftStartId(id);
  }, []);

  // If the user has an element selected and the draft is empty, prefill to reduce friction.
  useEffect(() => {
    const picked = selectionToElementId(selection);
    if (!picked) return;

    if (mode !== 'paths' && mode !== 'matrix') {
      if (!draftStartId) onChangeDraftStartIdSync(picked);
      return;
    }
    if (mode === 'paths') {
      if (!draftSourceId) onChangeDraftSourceIdSync(picked);
      else if (!draftTargetId && draftSourceId !== picked) setDraftTargetId(picked);
    }
  }, [selection, mode, draftStartId, draftSourceId, draftTargetId, onChangeDraftStartIdSync, onChangeDraftSourceIdSync]);

  const relatedOpts = useMemo(
    () => ({
      direction,
      maxDepth,
      includeStart,
      relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
      layers: layers.length ? layers : undefined,
      elementTypes: elementTypes.length ? elementTypes : undefined
    }),
    [direction, maxDepth, includeStart, relationshipTypes, layers, elementTypes]
  );

  const pathsOpts = useMemo(
    () => ({
      direction,
      maxPaths,
      maxPathLength: maxPathLength === null ? undefined : maxPathLength,
      relationshipTypes: relationshipTypes.length ? relationshipTypes : undefined,
      layers: layers.length ? layers : undefined,
      elementTypes: elementTypes.length ? elementTypes : undefined
    }),
    [direction, maxPaths, maxPathLength, relationshipTypes, layers, elementTypes]
  );

  // Results are driven by active element selection + *draft* filters (QoL).
  const relatedResult = useAnalysisRelatedElements(activeStartId || null, relatedOpts);
  const pathsResult = useAnalysisPathsBetween(activeSourceId || null, activeTargetId || null, pathsOpts);

  const selectionElementIds = useMemo(() => selectionToElementIds(selection), [selection]);

  // -----------------------------
  // Matrix workspace state (draft + persisted UI options + presets/snapshots)
  // -----------------------------
  const matrix = useMatrixWorkspaceState({
    model,
    modelId,
    modelKind,
    direction,
    relationshipTypes,
    selectionElementIds,
  });

  const [matrixCellDialog, setMatrixCellDialog] = useState<{
    rowId: string;
    rowLabel: string;
    colId: string;
    colLabel: string;
    relationshipIds: string[];
  } | null>(null);

  const canRun = Boolean(
    model &&
      (mode === 'matrix'
        ? matrix.rowIds.length > 0 && matrix.colIds.length > 0
        : mode !== 'paths'
          ? draftStartId
          : draftSourceId && draftTargetId && draftSourceId !== draftTargetId)
  );

  function run() {
    if (!model) return;
    if (mode === 'matrix') {
      matrix.build();
      return;
    }
    if (mode !== 'paths') {
      setActiveStartId(draftStartId);
      return;
    }
    setActiveSourceId(draftSourceId);
    setActiveTargetId(draftTargetId);
    // Keep related/traceability baseline aligned with the chosen source.
    setActiveStartId(draftSourceId);
  }

  function applyPreset(presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') {
    if (presetId === 'clear') {
      setDirection('both');
      setRelationshipTypes([]);
      setLayers([]);
      setElementTypes([]);
      setMaxDepth(4);
      setIncludeStart(false);
      setMaxPaths(10);
      setMaxPathLength(null);
      matrix.resetDraft();
      return;
    }

    if (presetId === 'upstream') {
      setDirection('incoming');
      setMaxDepth(3);
      setMaxPaths(10);
      setMaxPathLength(null);
      return;
    }

    if (presetId === 'downstream') {
      setDirection('outgoing');
      setMaxDepth(3);
      setMaxPaths(10);
      setMaxPathLength(null);
      return;
    }

    // crossLayerTrace: Business → Application → Technology
    setDirection('both');
    setMaxDepth(4);
    setLayers(['Business', 'Application', 'Technology']);
    setElementTypes([]);
    setRelationshipTypes(['Realization', 'Serving', 'Assignment', 'Access', 'Flow', 'Association']);
    setMaxPaths(10);
    setMaxPathLength(null);
  }

  function useSelectionAs(which: 'start' | 'source' | 'target') {
    const picked = selectionToElementId(selection);
    if (!picked) return;
    if (which === 'start') onChangeDraftStartIdSync(picked);
    if (which === 'source') onChangeDraftSourceIdSync(picked);
    if (which === 'target') setDraftTargetId(picked);
  }

  const openTraceabilityFrom = (elementId: string) => {
    setMode('traceability');
    setDraftStartId(elementId);
    setActiveStartId(elementId);
  };

  const traceSeedId = activeStartId || draftStartId || selectionToElementId(selection) || '';

  const matrixUiQuery = useMemo(() => ({
    rowSource: matrix.rowSource,
    rowElementType: matrix.rowElementType,
    rowLayer: matrix.rowLayer,
    rowSelectionIds: [...matrix.rowSelectionIds],
    colSource: matrix.colSource,
    colElementType: matrix.colElementType,
    colLayer: matrix.colLayer,
    colSelectionIds: [...matrix.colSelectionIds],
    direction,
    relationshipTypes: [...relationshipTypes],

    cellMetricId: matrix.cellMetricId,
    heatmapEnabled: matrix.heatmapEnabled,
    hideEmpty: matrix.hideEmpty,
    highlightMissing: matrix.highlightMissing,
    weightPresetId: matrix.weightPresetId,
    weightsByRelationshipType: matrix.weightsByRelationshipType,
  }), [
    direction,
    matrix.cellMetricId,
    matrix.colElementType,
    matrix.colLayer,
    matrix.colSelectionIds,
    matrix.colSource,
    matrix.heatmapEnabled,
    matrix.hideEmpty,
    matrix.highlightMissing,
    matrix.rowElementType,
    matrix.rowLayer,
    matrix.rowSelectionIds,
    matrix.rowSource,
    matrix.weightPresetId,
    matrix.weightsByRelationshipType,
    relationshipTypes
  ]);

  return (
    <div className="workspace" aria-label="Analysis workspace">
      <AnalysisWorkspaceHeader
        mode={mode}
        onChangeMode={setMode}
        canOpenTraceability={Boolean(selectionToElementId(selection))}
        onOpenTraceability={() => {
          const picked = selectionToElementId(selection);
          if (picked) openTraceabilityFrom(picked);
        }}
      />

      {!model ? (
        <div className="crudSection">
          <div className="crudHeader">
            <div>
              <p className="crudTitle">No model loaded</p>
              <p className="crudHint">Create or open a model to run analyses.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {mode !== 'portfolio' ? (
            <AnalysisQueryPanel
              model={model}
              modelKind={modelKind}
              mode={mode}
              onChangeMode={setMode}
              selectionElementIds={selectionElementIds}
              matrixRowSource={matrix.rowSource}
              onChangeMatrixRowSource={matrix.setRowSource}
              matrixRowElementType={matrix.rowElementType}
              onChangeMatrixRowElementType={matrix.setRowElementType}
              matrixRowLayer={matrix.rowLayer}
              onChangeMatrixRowLayer={matrix.setRowLayer}
              matrixRowSelectionIds={matrix.rowSelectionIds}
              onCaptureMatrixRowSelection={matrix.captureSelectionAsRows}
              matrixColSource={matrix.colSource}
              onChangeMatrixColSource={matrix.setColSource}
              matrixColElementType={matrix.colElementType}
              onChangeMatrixColElementType={matrix.setColElementType}
              matrixColLayer={matrix.colLayer}
              onChangeMatrixColLayer={matrix.setColLayer}
              matrixColSelectionIds={matrix.colSelectionIds}
              onCaptureMatrixColSelection={matrix.captureSelectionAsCols}
              onSwapMatrixAxes={matrix.swapAxes}
              matrixResolvedRowCount={matrix.rowIds.length}
              matrixResolvedColCount={matrix.colIds.length}
              matrixBuildNonce={matrix.buildNonce}
              matrixHasBuilt={Boolean(matrix.builtQuery)}
              matrixPresets={matrix.presets}
              matrixPresetId={matrix.presetId}
              onChangeMatrixPresetId={matrix.setPresetId}
              onSaveMatrixPreset={() => matrix.saveCurrentPreset(matrixUiQuery)}
              onApplyMatrixPreset={() => {
                const p = matrix.presets.find((x) => x.id === matrix.presetId);
                if (!p) return;
                matrix.applyUiQuery(p.query);
                setDirection(p.query.direction);
                setRelationshipTypes([...p.query.relationshipTypes]);
              }}
              onDeleteMatrixPreset={matrix.deleteSelectedPreset}
              matrixSnapshots={matrix.snapshots}
              matrixSnapshotId={matrix.snapshotId}
              onChangeMatrixSnapshotId={matrix.setSnapshotId}
              canSaveMatrixSnapshot={Boolean(matrix.result)}
              onSaveMatrixSnapshot={() => matrix.saveSnapshot(matrixUiQuery)}
              onRestoreMatrixSnapshot={() => {
                const snap = matrix.snapshots.find((s) => s.id === matrix.snapshotId);
                if (!snap) return;
                matrix.applyUiQuery(snap.uiQuery);
                setDirection(snap.uiQuery.direction);
                setRelationshipTypes([...snap.uiQuery.relationshipTypes]);
                matrix.restoreSnapshot(matrix.snapshotId);
              }}
              onDeleteMatrixSnapshot={() => {
                const id = matrix.snapshotId;
                matrix.setSnapshotId('');
                if (id) matrix.deleteSnapshot(id);
              }}
              direction={direction}
              onChangeDirection={setDirection}
              relationshipTypes={relationshipTypes}
              onChangeRelationshipTypes={setRelationshipTypes}
              layers={layers}
              onChangeLayers={setLayers}
              elementTypes={elementTypes}
              onChangeElementTypes={setElementTypes}
              maxDepth={maxDepth}
              onChangeMaxDepth={setMaxDepth}
              includeStart={includeStart}
              onChangeIncludeStart={setIncludeStart}
              maxPaths={maxPaths}
              onChangeMaxPaths={setMaxPaths}
              maxPathLength={maxPathLength}
              onChangeMaxPathLength={setMaxPathLength}
              onApplyPreset={applyPreset}
              draftStartId={draftStartId}
              onChangeDraftStartId={onChangeDraftStartIdSync}
              draftSourceId={draftSourceId}
              onChangeDraftSourceId={onChangeDraftSourceIdSync}
              draftTargetId={draftTargetId}
              onChangeDraftTargetId={setDraftTargetId}
              onUseSelection={useSelectionAs}
              canUseSelection={Boolean(selectionToElementId(selection))}
              canRun={canRun}
              onRun={run}
            />
          ) : null}

          {mode === 'matrix' ? (
            <>
              {matrix.result ? (
                <RelationshipMatrixTable
                  modelName={model.metadata?.name || 'model'}
                  result={matrix.result}
                  cellMetricId={matrix.cellMetricId}
                  onChangeCellMetricId={matrix.setCellMetricId}
                  weightsByRelationshipType={matrix.weightsByRelationshipType}
                  onChangeRelationshipTypeWeight={(relationshipType, weight) =>
                    matrix.setWeightsByRelationshipType((prev) => ({ ...prev, [relationshipType]: weight }))
                  }
                  weightPresets={matrix.weightPresets}
                  weightPresetId={matrix.weightPresetId}
                  onChangeWeightPresetId={(presetId) => matrix.applyWeightPreset(presetId)}
                  relationshipTypesForWeights={matrix.relationshipTypesForWeights}
                  cellValues={matrix.cellValues}
                  highlightMissing={matrix.highlightMissing}
                  onToggleHighlightMissing={() => matrix.setHighlightMissing((v) => !v)}
                  heatmapEnabled={matrix.heatmapEnabled}
                  onChangeHeatmapEnabled={matrix.setHeatmapEnabled}
                  hideEmpty={matrix.hideEmpty}
                  onChangeHideEmpty={matrix.setHideEmpty}
                  onOpenCell={(info) => setMatrixCellDialog(info)}
                />
              ) : null}

              {matrix.result && matrixCellDialog ? (
                <RelationshipMatrixCellDialog
                  isOpen={Boolean(matrixCellDialog)}
                  onClose={() => setMatrixCellDialog(null)}
                  model={model}
                  cell={matrixCellDialog}
                />
              ) : null}
            </>
          ) : mode === 'portfolio' ? (
            <PortfolioAnalysisView
              model={model}
              modelKind={modelKind}
              selection={selection}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
            />
          ) : mode === 'traceability' ? (
            traceSeedId ? (
              <TraceabilityExplorer
                model={model}
                modelKind={modelKind}
                seedId={traceSeedId}
                direction={direction}
                relationshipTypes={relationshipTypes}
                layers={layers}
                elementTypes={elementTypes}
                expandDepth={maxDepth}
                onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
                onSelectRelationship={(relationshipId) => onSelect({ kind: 'relationship', relationshipId })}
              />
            ) : (
              <div className="crudSection">
                <div className="crudHeader">
                  <div>
                    <p className="crudTitle">No start element</p>
                    <p className="crudHint">
                      Pick a start element in the Query panel (or select an element in the model) and click Run analysis.
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <AnalysisResultTable
              model={model}
              modelKind={modelKind}
              mode={mode}
              relatedResult={relatedResult}
              pathsResult={pathsResult}
              selection={selection}
              direction={direction}
              relationshipTypes={relationshipTypes}
              onSelectRelationship={(relationshipId) => onSelect({ kind: 'relationship', relationshipId })}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
              onOpenTraceability={(elementId) => openTraceabilityFrom(elementId)}
            />
          )}
        </>
      )}
    </div>
  );
}
