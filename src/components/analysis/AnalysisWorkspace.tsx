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
              state={{
                mode,
                selectionElementIds,
                draft: {
                  startId: draftStartId,
                  sourceId: draftSourceId,
                  targetId: draftTargetId,
                },
                filters: {
                  direction,
                  relationshipTypes,
                  layers,
                  elementTypes,
                  maxDepth,
                  includeStart,
                  maxPaths,
                  maxPathLength,
                },
                matrix: {
                  rowSource: matrixState.axes.rowSource,
                  rowElementType: matrixState.axes.rowElementType,
                  rowLayer: matrixState.axes.rowLayer,
                  rowSelectionIds: matrixState.axes.rowSelectionIds,

                  colSource: matrixState.axes.colSource,
                  colElementType: matrixState.axes.colElementType,
                  colLayer: matrixState.axes.colLayer,
                  colSelectionIds: matrixState.axes.colSelectionIds,

                  resolvedRowCount: matrixState.axes.rowIds.length,
                  resolvedColCount: matrixState.axes.colIds.length,
                  hasBuilt: Boolean(matrixState.build.builtQuery),
                  buildNonce: matrixState.build.buildNonce,

                  presets: matrixState.presets.presets,
                  presetId: matrixState.presets.presetId,

                  snapshots: matrixState.presets.snapshots,
                  snapshotId: matrixState.presets.snapshotId,
                  canSaveSnapshot: Boolean(matrixDerived.result),
                },
              }}
              actions={{
                setMode,
                run,
                draft: {
                  setStartId: onChangeDraftStartId,
                  setSourceId: onChangeDraftSourceId,
                  setTargetId: onChangeDraftTargetId,
                  useSelection: useSelectionAs,
                },
                filters: {
                  setDirection,
                  setRelationshipTypes,
                  setLayers,
                  setElementTypes,
                  setMaxDepth,
                  setIncludeStart,
                  setMaxPaths,
                  setMaxPathLength,
                  applyPreset,
                },
                matrix: {
                  setRowSource: matrixActions.axes.setRowSource,
                  setRowElementType: matrixActions.axes.setRowElementType,
                  setRowLayer: matrixActions.axes.setRowLayer,
                  setRowSelectionIds: matrixActions.axes.setRowSelectionIds,
                  captureRowSelection: matrixActions.axes.captureSelectionAsRows,

                  setColSource: matrixActions.axes.setColSource,
                  setColElementType: matrixActions.axes.setColElementType,
                  setColLayer: matrixActions.axes.setColLayer,
                  setColSelectionIds: matrixActions.axes.setColSelectionIds,
                  captureColSelection: matrixActions.axes.captureSelectionAsCols,

                  swapAxes: matrixActions.axes.swapAxes,

                  setPresetId: matrixActions.presets.setPresetId,
                  savePreset: () => matrixActions.presets.saveCurrentPreset(matrixUiQuery),
                  applySelectedPreset: () => {
                    const p = matrixState.presets.presets.find((x) => x.id === matrixState.presets.presetId);
                    if (!p) return;
                    matrixActions.presets.applyUiQuery(p.query);
                    setDirection(p.query.direction);
                    setRelationshipTypes([...p.query.relationshipTypes]);
                  },
                  deleteSelectedPreset: matrixActions.presets.deleteSelectedPreset,

                  setSnapshotId: matrixActions.presets.setSnapshotId,
                  saveSnapshot: () => matrixActions.presets.saveSnapshot(matrixUiQuery),
                  restoreSelectedSnapshot: () => {
                    const snap = matrixState.presets.snapshots.find((s) => s.id === matrixState.presets.snapshotId);
                    if (!snap) return;
                    matrixActions.presets.applyUiQuery(snap.uiQuery);
                    setDirection(snap.uiQuery.direction);
                    setRelationshipTypes([...snap.uiQuery.relationshipTypes]);
                    matrixActions.presets.restoreSnapshot(matrixState.presets.snapshotId);
                  },
                  deleteSelectedSnapshot: () => {
                    const id = matrixState.presets.snapshotId;
                    matrixActions.presets.setSnapshotId('');
                    if (id) matrixActions.presets.deleteSnapshot(id);
                  },
                },
              }}
              meta={{
                canRun,
                canUseSelection: canOpenTraceability,
              }}
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
