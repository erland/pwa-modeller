import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ModelKind, ViewNodeLayout } from '../../domain';
import { createView, materializeViewConnectionsForView } from '../../domain';
import type { Selection } from '../model/selection';

import { modelStore } from '../../store';

import '../../styles/crud.css';

import { AnalysisQueryPanel } from './AnalysisQueryPanel';
import { MatrixModeView } from './modes/MatrixModeView';
import { PortfolioModeView } from './modes/PortfolioModeView';
import { ResultsModeView } from './modes/ResultsModeView';
import { TraceabilityModeView } from './modes/TraceabilityModeView';
import { SandboxModeView } from './modes/SandboxModeView';

import { AnalysisWorkspaceHeader } from './workspace/AnalysisWorkspaceHeader';
import { useAnalysisWorkspaceController } from './workspace/useAnalysisWorkspaceController';

import { ExportDialog } from './export/ExportDialog';
import { buildAnalysisRequest } from './contracts/buildAnalysisRequest';
import { buildAnalysisViewState } from './contracts/buildAnalysisViewState';
import { loadAnalysisUiState } from './analysisUiStateStorage';

export function AnalysisWorkspace({
  modelKind,
  selection,
  onSelect,
  sandboxSeedViewId,
  onOpenViewInWorkspace,
}: {
  modelKind: ModelKind;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  sandboxSeedViewId?: string | null;
  onOpenViewInWorkspace?: (openViewId: string) => void;
}) {
  const { state, actions, derived } = useAnalysisWorkspaceController({ modelKind, selection });
  const {
    model,
    modelId,
    mode,
    direction,
    relationshipTypes,
    layers,
    elementTypes,
    maxDepth,
    includeStart,
    maxPaths,
    maxPathLength,
    pathsMode,
    draftStartId,
    draftSourceId,
    draftTargetId,
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

  const [exportOpen, setExportOpen] = useState(false);

  const analysisRequest = useMemo(() => {
    if (!model) return null;
    return buildAnalysisRequest({
      mode,

      // The analysis workspace auto-runs and keeps active ids aligned,
      // but those are not currently surfaced from the controller.
      // For export wiring (Step 2), use the draft ids.
      activeStartId: draftStartId,
      activeSourceId: draftSourceId,
      activeTargetId: draftTargetId,

      direction,
      relationshipTypes,
      layers,
      elementTypes,

      maxDepth,
      includeStart,

      maxPaths,
      maxPathLength,
      pathsMode,

      matrixBuiltQuery: matrix.state.build.builtQuery,
    });
  }, [
    direction,
    draftSourceId,
    draftStartId,
    draftTargetId,
    elementTypes,
    includeStart,
    layers,
    matrix.state.build.builtQuery,
    maxDepth,
    maxPathLength,
    maxPaths,
    model,
    mode,
    pathsMode,
    relationshipTypes,
  ]);

  const analysisViewState = useMemo(() => {
    if (!model) return null;
    const persistedUi = loadAnalysisUiState(modelId);
    return buildAnalysisViewState({
      mode,
      persistedUi,
      sandbox: {
        showRelationships: sandbox.state.relationships.show,
        relationshipMode: sandbox.state.relationships.mode,
        enabledRelationshipTypes: sandbox.state.relationships.enabledTypes,
        addRelatedDepth: sandbox.state.addRelated.depth,
        addRelatedDirection: sandbox.state.addRelated.direction,
        addRelatedEnabledTypes: sandbox.state.addRelated.enabledTypes,
        persistEnabled: sandbox.state.ui.persistEnabled,
        edgeRouting: sandbox.state.ui.edgeRouting,
      },
    });
  }, [model, modelId, mode, sandbox.state.addRelated, sandbox.state.relationships, sandbox.state.ui.edgeRouting, sandbox.state.ui.persistEnabled]);

  const lastSeedViewId = useRef<string | null>(null);
  useEffect(() => {
    if (!sandboxSeedViewId) return;
    if (!model) return;
    if (lastSeedViewId.current === sandboxSeedViewId) return;
    lastSeedViewId.current = sandboxSeedViewId;
    sandbox.actions.seedFromView(sandboxSeedViewId);
    setMode('sandbox');
  }, [model, sandbox.actions, sandboxSeedViewId, setMode]);

  const onSaveSandboxAsDiagram = useCallback(
    (name: string, visibleRelationshipIds: string[]) => {
      if (!model) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      // Infer diagram kind from the sandbox nodes.
      const nodeIds = sandbox.state.nodes.map((n) => n.elementId);
      const kindCounts: Record<ModelKind, number> = { archimate: 0, uml: 0, bpmn: 0 };
      for (const id of nodeIds) {
        const el = model.elements[id];
        const k = (el?.kind ?? 'archimate') as ModelKind;
        kindCounts[k] = (kindCounts[k] ?? 0) + 1;
      }
      const inferredKind: ModelKind = (Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ModelKind) ?? 'archimate';

      const viewpointId = inferredKind === 'uml' ? 'uml-class' : inferredKind === 'bpmn' ? 'bpmn-process' : 'layered';

      // Ensure a unique diagram name.
      const existingNames = new Set(Object.values(model.views).map((v) => v.name));
      let uniqueName = trimmed;
      if (existingNames.has(uniqueName)) {
        let i = 2;
        while (existingNames.has(`${trimmed} (${i})`)) i++;
        uniqueName = `${trimmed} (${i})`;
      }

      const defaultsByKind: Record<ModelKind, { width: number; height: number }> = {
        archimate: { width: 120, height: 60 },
        bpmn: { width: 160, height: 80 },
        uml: { width: 170, height: 90 },
      };
      const d = defaultsByKind[inferredKind] ?? defaultsByKind.archimate;

      // Normalize positions to keep everything within a positive viewport margin.
      const xs = sandbox.state.nodes.map((n) => n.x);
      const ys = sandbox.state.nodes.map((n) => n.y);
      const minX = xs.length ? Math.min(...xs) : 0;
      const minY = ys.length ? Math.min(...ys) : 0;
      const dx = minX < 40 ? 40 - minX : 0;
      const dy = minY < 40 ? 40 - minY : 0;

      const layoutNodes: ViewNodeLayout[] = sandbox.state.nodes.map((n, idx) => ({
        elementId: n.elementId,
        x: n.x + dx,
        y: n.y + dy,
        width: d.width,
        height: d.height,
        locked: n.pinned ?? false,
        zIndex: idx,
      }));

      const sortedRelIds = Array.from(new Set(visibleRelationshipIds.filter((id) => typeof id === 'string' && id.length > 0)))
        .filter((id) => Boolean(model.relationships[id]))
        .sort((a, b) => a.localeCompare(b));

      const viewDraft = createView({
        name: uniqueName,
        kind: inferredKind,
        viewpointId,
        relationshipVisibility: { mode: 'explicit', relationshipIds: sortedRelIds },
        layout: { nodes: layoutNodes, relationships: [] },
        objects: {},
        connections: [],
      });

      const connections = materializeViewConnectionsForView(model, viewDraft);
      const view = { ...viewDraft, connections };

      // Prefer putting new views into the built-in "Views" folder if present.
      const viewsFolderId = Object.values(model.folders).find((f) => f.kind === 'views')?.id;
      modelStore.addView(view, viewsFolderId);

      // Navigate back to the main workspace and open the new view.
      onOpenViewInWorkspace?.(view.id);
    },
    [model, onOpenViewInWorkspace, sandbox.state.nodes]
  );


  const onOpenSandboxFromResults = useCallback(
    (args: {
      elementIds: string[];
      relationshipIds?: string[];
      relationshipTypes?: string[];
      layout?: { mode: 'grid' | 'distance' | 'levels'; levelById?: Record<string, number>; orderById?: Record<string, number> };
    }) => {
      if (!model) return;
      sandbox.actions.seedFromElements(args);
      setMode('sandbox');
    },
    [model, sandbox.actions, setMode]
  );

  return (
    <div className="workspace" aria-label="Analysis workspace">
      <AnalysisWorkspaceHeader
        mode={mode}
        onChangeMode={setMode}
        canOpenTraceability={canOpenTraceability}
        onOpenTraceability={openTraceabilityFromSelection}
        canExport={Boolean(model && analysisRequest && analysisViewState)}
        onOpenExport={() => setExportOpen(true)}
      />

      {analysisRequest && analysisViewState ? (
        <ExportDialog
          isOpen={exportOpen}
          kind={analysisRequest.kind}
          request={analysisRequest}
          viewState={analysisViewState}
          onClose={() => setExportOpen(false)}
        />
      ) : null}

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
              ui={sandbox.state.ui}
              selection={selection}
              selectionElementIds={selectionElementIds}
              onSelectElement={(elementId) => onSelect({ kind: 'element', elementId })}
              onSelectRelationship={(relationshipId) => onSelect({ kind: 'relationship', relationshipId })}
              onClearSelection={() => onSelect({ kind: 'none' })}
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
              onAddRelatedFromSelection={(anchorIds, allowedIds) => sandbox.actions.addRelatedFromSelection(anchorIds, allowedIds)}
              onInsertIntermediatesBetween={(a, b, options) => sandbox.actions.insertIntermediatesBetween(a, b, options)}
              onSaveAsDiagram={onSaveSandboxAsDiagram}
              onAutoLayout={() => sandbox.actions.autoLayout()}
              onSetPersistEnabled={(enabled) => sandbox.actions.setPersistEnabled(enabled)}
              onSetEdgeRouting={(routing) => sandbox.actions.setEdgeRouting(routing)}
              onClearWarning={() => sandbox.actions.clearWarning()}
              onUndoLastInsert={() => sandbox.actions.undoLastInsert()}
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
              onOpenSandbox={onOpenSandboxFromResults}
            />
          )}
        </>
      )}
    </div>
  );
}
