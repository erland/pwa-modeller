import type { ModelKind } from '../../domain';
import type { Selection } from '../model/selection';

import '../../styles/crud.css';

import { AnalysisQueryPanel } from './AnalysisQueryPanel';
import { MatrixModeView } from './modes/MatrixModeView';
import { PortfolioModeView } from './modes/PortfolioModeView';
import { ResultsModeView } from './modes/ResultsModeView';
import { TraceabilityModeView } from './modes/TraceabilityModeView';

import { AnalysisWorkspaceHeader } from './workspace/AnalysisWorkspaceHeader';
import { useAnalysisWorkspaceController } from './workspace/useAnalysisWorkspaceController';

export function AnalysisWorkspace({
  modelKind,
  selection,
  onSelect
}: {
  modelKind: ModelKind;
  selection: Selection;
  onSelect: (sel: Selection) => void;
}) {
  const { state, actions, derived } = useAnalysisWorkspaceController({ modelKind, selection });
  const {
    model,
    mode,
    direction,
    relationshipTypes,
    layers,
    elementTypes,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength,
    draftStartId,
    draftSourceId,
    draftTargetId,
    matrixCellDialog,
    matrixState,
  } = state;

  const {
    setMode,
    setDirection,
    setRelationshipTypes,
    setLayers,
    setElementTypes,
    setMaxDepth,
    setIncludeStart,
    setMaxPaths,
    setMaxPathLength,
    onChangeDraftStartId,
    onChangeDraftSourceId,
    onChangeDraftTargetId,
    run,
    applyPreset,
    useSelectionAs,
    openTraceabilityFrom,
    setMatrixCellDialog,
    matrixActions,
  } = actions;

  const {
    selectionElementIds,
    canRun,
    canOpenTraceability,
    openTraceabilityFromSelection,
    relatedResult,
    pathsResult,
    traceSeedId,
    matrixDerived,
    matrixUiQuery,
  } = derived;

  return (
    <div className="workspace" aria-label="Analysis workspace">
      <AnalysisWorkspaceHeader
        mode={mode}
        onChangeMode={setMode}
        canOpenTraceability={canOpenTraceability}
        onOpenTraceability={openTraceabilityFromSelection}
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
              matrixRowSource={matrixState.axes.rowSource}
              onChangeMatrixRowSource={matrixActions.axes.setRowSource}
              matrixRowElementType={matrixState.axes.rowElementType}
              onChangeMatrixRowElementType={matrixActions.axes.setRowElementType}
              matrixRowLayer={matrixState.axes.rowLayer}
              onChangeMatrixRowLayer={matrixActions.axes.setRowLayer}
              matrixRowSelectionIds={matrixState.axes.rowSelectionIds}
              onCaptureMatrixRowSelection={matrixActions.axes.captureSelectionAsRows}
              matrixColSource={matrixState.axes.colSource}
              onChangeMatrixColSource={matrixActions.axes.setColSource}
              matrixColElementType={matrixState.axes.colElementType}
              onChangeMatrixColElementType={matrixActions.axes.setColElementType}
              matrixColLayer={matrixState.axes.colLayer}
              onChangeMatrixColLayer={matrixActions.axes.setColLayer}
              matrixColSelectionIds={matrixState.axes.colSelectionIds}
              onCaptureMatrixColSelection={matrixActions.axes.captureSelectionAsCols}
              onSwapMatrixAxes={matrixActions.axes.swapAxes}
              matrixResolvedRowCount={matrixState.axes.rowIds.length}
              matrixResolvedColCount={matrixState.axes.colIds.length}
              matrixBuildNonce={matrixState.build.buildNonce}
              matrixHasBuilt={Boolean(matrixState.build.builtQuery)}
              matrixPresets={matrixState.presets.presets}
              matrixPresetId={matrixState.presets.presetId}
              onChangeMatrixPresetId={matrixActions.presets.setPresetId}
              onSaveMatrixPreset={() => matrixActions.presets.saveCurrentPreset(matrixUiQuery)}
              onApplyMatrixPreset={() => {
                const p = matrixState.presets.presets.find((x) => x.id === matrixState.presets.presetId);
                if (!p) return;
                matrixActions.presets.applyUiQuery(p.query);
                setDirection(p.query.direction);
                setRelationshipTypes([...p.query.relationshipTypes]);
              }}
              onDeleteMatrixPreset={matrixActions.presets.deleteSelectedPreset}
              matrixSnapshots={matrixState.presets.snapshots}
              matrixSnapshotId={matrixState.presets.snapshotId}
              onChangeMatrixSnapshotId={matrixActions.presets.setSnapshotId}
              canSaveMatrixSnapshot={Boolean(matrixDerived.result)}
              onSaveMatrixSnapshot={() => matrixActions.presets.saveSnapshot(matrixUiQuery)}
              onRestoreMatrixSnapshot={() => {
                const snap = matrixState.presets.snapshots.find((s) => s.id === matrixState.presets.snapshotId);
                if (!snap) return;
                matrixActions.presets.applyUiQuery(snap.uiQuery);
                setDirection(snap.uiQuery.direction);
                setRelationshipTypes([...snap.uiQuery.relationshipTypes]);
                matrixActions.presets.restoreSnapshot(matrixState.presets.snapshotId);
              }}
              onDeleteMatrixSnapshot={() => {
                const id = matrixState.presets.snapshotId;
                matrixActions.presets.setSnapshotId('');
                if (id) matrixActions.presets.deleteSnapshot(id);
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
              onChangeDraftStartId={onChangeDraftStartId}
              draftSourceId={draftSourceId}
              onChangeDraftSourceId={onChangeDraftSourceId}
              draftTargetId={draftTargetId}
              onChangeDraftTargetId={onChangeDraftTargetId}
              onUseSelection={useSelectionAs}
              canUseSelection={canOpenTraceability}
              canRun={canRun}
              onRun={run}
            />
          ) : null}

          {mode === 'matrix' ? (
            <MatrixModeView
              model={model}
              matrixState={matrixState}
              matrixActions={matrixActions}
              matrixDerived={matrixDerived}
              matrixCellDialog={matrixCellDialog}
              onOpenCell={(info) => setMatrixCellDialog(info)}
              onCloseCellDialog={() => setMatrixCellDialog(null)}
            />
          ) : mode === 'portfolio' ? (
            <PortfolioModeView
              model={model}
              modelKind={modelKind}
              selection={selection}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
            />
          ) : mode === 'traceability' ? (
            <TraceabilityModeView
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
            <ResultsModeView
              model={model}
              modelKind={modelKind}
              mode={mode as 'related' | 'paths'}
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
