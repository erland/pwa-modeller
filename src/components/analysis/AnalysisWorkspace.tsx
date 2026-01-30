import type { ModelKind } from '../../domain';
import type { Selection } from '../model/selection';

import '../../styles/crud.css';

import { AnalysisQueryPanel } from './AnalysisQueryPanel';
import { MatrixModeView } from './modes/MatrixModeView';
import { PortfolioModeView } from './modes/PortfolioModeView';
import { ResultsModeView } from './modes/ResultsModeView';
import { TraceabilityModeView } from './modes/TraceabilityModeView';
import { SandboxModeView } from './modes/SandboxModeView';

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
  } = state;

  const {
    setMode,
    openTraceabilityFrom,
  } = actions;

  const {
    canOpenTraceability,
    openTraceabilityFromSelection,
    relatedResult,
    pathsResult,
    traceSeedId,
    matrix,
    queryPanel,
    sandbox,
    selectionElementIds,
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
          {mode !== 'portfolio' && mode !== 'sandbox' ? (
            <AnalysisQueryPanel
              model={model}
              modelKind={modelKind}
              state={queryPanel.state}
              actions={queryPanel.actions}
              meta={queryPanel.meta}
            />
          ) : null}

          {mode === 'sandbox' ? (
            <SandboxModeView
              model={model}
              nodes={sandbox.state.nodes}
              relationships={sandbox.state.relationships}
              addRelated={sandbox.state.addRelated}
              selection={selection}
              selectionElementIds={selectionElementIds}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
              onMoveNode={(elementId, x, y) => sandbox.actions.setNodePosition(elementId, x, y)}
              onAddSelected={() => sandbox.actions.addManyIfMissing(selectionElementIds)}
              onRemoveSelected={() => sandbox.actions.removeMany(selectionElementIds)}
              onClear={() => sandbox.actions.clear()}
              onAddNodeAt={(elementId, x, y) => sandbox.actions.addIfMissing(elementId, x, y)}
              onSetShowRelationships={(show) => sandbox.actions.setShowRelationships(show)}
              onSetRelationshipMode={(mode) => sandbox.actions.setRelationshipMode(mode)}
              onSetEnabledRelationshipTypes={(types) => sandbox.actions.setEnabledRelationshipTypes(types)}
              onToggleEnabledRelationshipType={(type) => sandbox.actions.toggleEnabledRelationshipType(type)}
              onSetAddRelatedDepth={(depth) => sandbox.actions.setAddRelatedDepth(depth)}
              onSetAddRelatedDirection={(direction) => sandbox.actions.setAddRelatedDirection(direction)}
              onSetAddRelatedEnabledTypes={(types) => sandbox.actions.setAddRelatedEnabledTypes(types)}
              onToggleAddRelatedEnabledType={(type) => sandbox.actions.toggleAddRelatedEnabledType(type)}
              onAddRelatedFromSelection={(anchorIds) => sandbox.actions.addRelatedFromSelection(anchorIds)}
            />
          ) : mode === 'matrix' ? (
            <MatrixModeView
              model={model}
              matrixState={matrix.state}
              matrixActions={matrix.actions}
              matrixDerived={matrix.derived}
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
