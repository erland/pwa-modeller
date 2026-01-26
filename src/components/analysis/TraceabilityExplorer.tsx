import { useEffect, useMemo, useReducer, useState } from 'react';

import type { ElementType, Model, RelationshipType } from '../../domain';
import type { ModelKind } from '../../domain/types';
import type { AnalysisDirection } from '../../domain/analysis/filters';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { expandFromNode } from '../../analysis/traceability/expand';

import { createTraceabilityExplorerState, traceabilityReducer } from './traceability/traceabilityReducer';
import { TraceabilityMiniGraph } from './traceability/TraceabilityMiniGraph';
import { defaultMiniGraphOptions } from './MiniGraphOptions';
import { TraceabilitySettingsDialog } from './traceability/TraceabilitySettingsDialog';
import { TraceabilitySessionsDialog } from './traceability/TraceabilitySessionsDialog';

import {
  deleteTraceabilitySession,
  listTraceabilitySessions,
  saveTraceabilitySession,
  toExplorerState,
  toPersistedState
} from './traceability/traceabilitySessions';

import type { ExpandRequest, TraceExpansionPatch, TraceFilters } from '../../domain/analysis/traceability/types';

type Props = {
  model: Model;
  modelKind: ModelKind;
  seedId: string;

  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  layers: string[];
  elementTypes: ElementType[];

  expandDepth: number;

  onSelectElement: (elementId: string) => void;
  onSelectRelationship: (relationshipId: string) => void;
};

function toTraceFilters({
  direction,
  relationshipTypes,
  layers,
  elementTypes
}: Pick<Props, 'direction' | 'relationshipTypes' | 'layers' | 'elementTypes'>): Partial<TraceFilters> {
  return {
    direction: direction as never,
    relationshipTypes: relationshipTypes.length ? relationshipTypes.map(String) : undefined,
    layers: layers.length ? layers : undefined,
    elementTypes: elementTypes.length ? elementTypes.map(String) : undefined
  };
}

export function TraceabilityExplorer({
  model,
  modelKind,
  seedId,
  direction,
  relationshipTypes,
  layers,
  elementTypes,
  expandDepth,
  onSelectElement,
  onSelectRelationship
}: Props) {
  const adapter = useMemo(() => getAnalysisAdapter(modelKind), [modelKind]);

  const [autoExpand, setAutoExpand] = useState(false);
  const [graphOptions, setGraphOptions] = useState(defaultMiniGraphOptions);
  const [sessions, setSessions] = useState<Array<{ name: string; savedAt: string }>>([]);
  const [selectedSessionName, setSelectedSessionName] = useState<string>('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);

  const [state, dispatch] = useReducer(
    traceabilityReducer,
    undefined,
    () => createTraceabilityExplorerState([seedId], { filters: toTraceFilters({ direction, relationshipTypes, layers, elementTypes }) })
  );

  useEffect(() => {
    const items = listTraceabilitySessions(modelKind, model.id)
      .map((s) => ({ name: s.name, savedAt: s.savedAt }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setSessions(items);
  }, [model.id, modelKind]);

  useEffect(() => {
    // Seed changes are separate from filter changes to avoid surprising resets when tweaking filters.
    dispatch({ type: 'seed', seedIds: [seedId] });
  }, [seedId]);

  useEffect(() => {
    dispatch({ type: 'setFilters', filters: toTraceFilters({ direction, relationshipTypes, layers, elementTypes }) });
  }, [direction, relationshipTypes, layers, elementTypes]);


  const selectNode = (id: string) => {
    dispatch({ type: 'selectNode', nodeId: id });
    onSelectElement(id);
  };

  const selectEdge = (edgeId: string) => {
    dispatch({ type: 'selectEdge', edgeId });
    const e = state.edgesById[edgeId];
    if (e?.relationshipId) onSelectRelationship(e.relationshipId);
  };
  const selectedNodeId = state.selection.selectedNodeId ?? seedId;
  const canExpand = Boolean(selectedNodeId && model.elements[selectedNodeId]);

  const runExpand = (dirOverride?: 'incoming' | 'outgoing' | 'both', nodeOverride?: string) => {
    if (!canExpand) return;
    const nodeId = nodeOverride ?? selectedNodeId;

    const request: ExpandRequest = {
      nodeId,
      direction: (dirOverride ?? (state.filters.direction as never)) as never,
      depth: expandDepth,
      relationshipTypes: state.filters.relationshipTypes,
      layers: state.filters.layers,
      elementTypes: state.filters.elementTypes
    };

    dispatch({ type: 'expandRequested', request });
    const patch: TraceExpansionPatch = expandFromNode(model, adapter, request);
    dispatch({ type: 'expandApplied', request, patch });
  };

  const selectedName = selectedNodeId ? adapter.getNodeLabel(model.elements[selectedNodeId], model) : '(none)';

  const refreshSessions = () => {
    const items = listTraceabilitySessions(modelKind, model.id)
      .map((s) => ({ name: s.name, savedAt: s.savedAt }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setSessions(items);
  };

  const doSaveSession = () => {
    const proposed = selectedSessionName || window.prompt('Session name', seedId ? `Trace from ${seedId}` : 'Trace session') || '';
    const name = proposed.trim();
    if (!name) return;

    saveTraceabilitySession(modelKind, model.id, {
      name,
      seedId,
      expandDepth,
      state: toPersistedState(state)
    });

    setSelectedSessionName(name);
    refreshSessions();
  };

  const doLoadSession = () => {
    if (!selectedSessionName) return;
    const s = listTraceabilitySessions(modelKind, model.id).find((x) => x.name === selectedSessionName);
    if (!s) return;

    // Seed id + depth come from the session.
    dispatch({ type: 'loadSession', state: toExplorerState(s.state) });
    onSelectElement(s.seedId);
  };

  const doDeleteSession = () => {
    if (!selectedSessionName) return;
    const ok = window.confirm(`Delete session "${selectedSessionName}"?`);
    if (!ok) return;
    deleteTraceabilitySession(modelKind, model.id, selectedSessionName);
    setSelectedSessionName('');
    refreshSessions();
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="crudSection">
        <div className="crudHeader">
          <div>
            <p className="crudTitle">Traceability explorer</p>
            <p className="crudHint">Interactively expand upstream/downstream relationships from a seed element.</p>
          </div>

          <div className="toolbar" aria-label="Traceability explorer toolbar">
            <div className="toolbarGroup" style={{ minWidth: 240 }}>
              <label>Selected</label>
              <div className="mono" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedName}>
                {selectedName}
              </div>
            </div>




            <div className="toolbarGroup">
              <label>Options</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="miniLinkButton" onClick={() => setIsSettingsOpen(true)} aria-label="Traceability settings">
                  ⚙︎ Settings
                </button>
                <button type="button" className="miniLinkButton" onClick={() => setIsSessionsOpen(true)} aria-label="Traceability sessions">
                  Sessions
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="crudBody">
          <p className="crudHint" style={{ marginTop: 0 }}>
            Tip: set filters in the Query panel above, press <span className="mono">Run analysis</span>, then expand from nodes in the graph.
          </p>
        </div>
      </div>

      <TraceabilityMiniGraph
        wrapLabels={true}
        autoFitColumns={true}
                headerControls={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => runExpand('incoming')}
              disabled={!canExpand}
              aria-label="Expand upstream"
              title="Expand upstream"
            >
              ←
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => runExpand('outgoing')}
              disabled={!canExpand}
              aria-label="Expand downstream"
              title="Expand downstream"
            >
              →
            </button>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => runExpand('both')}
              disabled={!canExpand}
              aria-label="Expand both directions"
              title="Expand both directions"
            >
              ⇄
            </button>

            <span aria-hidden="true" style={{ opacity: 0.4, padding: '0 2px' }}>
              |
            </span>

            <button
              type="button"
              className="miniLinkButton"
              onClick={() => dispatch({ type: 'collapseNode', nodeId: selectedNodeId })}
              disabled={!canExpand}
              aria-label="Collapse"
              title="Collapse"
            >
              Collapse
            </button>

            <button
              type="button"
              className="miniLinkButton"
              onClick={() => dispatch({ type: 'togglePin', nodeId: selectedNodeId })}
              disabled={!canExpand}
              aria-label={state.nodesById[selectedNodeId]?.pinned ? 'Unpin' : 'Pin'}
              title={state.nodesById[selectedNodeId]?.pinned ? 'Unpin' : 'Pin'}
              style={{ fontWeight: state.nodesById[selectedNodeId]?.pinned ? 700 : 400 }}
            >
              📌
            </button>

            <button
              type="button"
              className="miniLinkButton"
              onClick={() => dispatch({ type: 'reset', seedIds: [seedId], options: { filters: state.filters } })}
              aria-label="Reset"
              title="Reset"
            >
              Reset
            </button>
          </div>
        }
        model={model}
        modelKind={modelKind}
        nodesById={state.nodesById}
        edgesById={state.edgesById}
        selection={state.selection}
        onSelectNode={(id) => {
          selectNode(id);
          if (!autoExpand) return;
          if (!model.elements[id]) return;
          if (state.pendingByNodeId[id]) return;
          runExpand(undefined, id);
        }}
        onSelectEdge={(id) => selectEdge(id)}
        onExpandNode={(id, dir) => {
          selectNode(id);
          runExpand(dir, id);
        }}
        onTogglePin={(id) => dispatch({ type: 'togglePin', nodeId: id })}
      />


      <TraceabilitySettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        autoExpand={autoExpand}
        onChangeAutoExpand={setAutoExpand}
        graphOptions={graphOptions}
        onChangeGraphOptions={setGraphOptions}
      />

      <TraceabilitySessionsDialog
        isOpen={isSessionsOpen}
        onClose={() => setIsSessionsOpen(false)}
        sessions={sessions}
        selectedSessionName={selectedSessionName}
        onChangeSelectedSessionName={setSelectedSessionName}
        onSave={doSaveSession}
        onLoad={doLoadSession}
        onDelete={doDeleteSession}
      />
      <div className="crudSection" style={{ marginTop: 14 }}>
        <div className="crudHeader">
          <div>
            <p className="crudTitle">Nodes</p>
            <p className="crudHint">A simple list of discovered elements (v1).</p>
          </div>
        </div>

        <div className="crudBody">
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border-1)', borderRadius: 12 }}>
            <table className="dataTable" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Depth</th>
                  <th>Element</th>
                  <th style={{ width: 120 }}>Pinned</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(state.nodesById)
                  .filter((n) => !n.hidden)
                  .sort((a, b) => {
                    if (a.depth !== b.depth) return a.depth - b.depth;
                    const an = adapter.getNodeLabel(model.elements[a.id], model);
                    const bn = adapter.getNodeLabel(model.elements[b.id], model);
                    return an.localeCompare(bn);
                  })
                  .map((n) => (
                    <tr
                      key={n.id}
                      className={state.selection.selectedNodeId === n.id ? 'isSelected' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => selectNode(n.id)}
                    >
                      <td className="mono">{n.depth}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{adapter.getNodeLabel(model.elements[n.id], model)}</div>
                        <div className="crudHint mono" style={{ margin: 0 }}>
                          {n.id}
                        </div>
                      </td>
                      <td>{n.pinned ? 'Yes' : ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
