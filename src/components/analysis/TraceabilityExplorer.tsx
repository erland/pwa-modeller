import { useEffect, useMemo, useReducer } from 'react';

import type { ElementType, Model, RelationshipType } from '../../domain';
import type { ModelKind } from '../../domain/types';
import type { AnalysisDirection } from '../../domain/analysis/filters';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { expandFromNode } from '../../analysis/traceability/expand';

import { createTraceabilityExplorerState, traceabilityReducer } from './traceability/traceabilityReducer';
import { TraceabilityMiniGraph } from './traceability/TraceabilityMiniGraph';

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
  expandDepth
}: Props) {
  const adapter = useMemo(() => getAnalysisAdapter(modelKind), [modelKind]);

  const [state, dispatch] = useReducer(
    traceabilityReducer,
    undefined,
    () => createTraceabilityExplorerState([seedId], { filters: toTraceFilters({ direction, relationshipTypes, layers, elementTypes }) })
  );

  useEffect(() => {
    dispatch({ type: 'seed', seedIds: [seedId], options: { filters: toTraceFilters({ direction, relationshipTypes, layers, elementTypes }) } });
  }, [seedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dispatch({ type: 'setFilters', filters: toTraceFilters({ direction, relationshipTypes, layers, elementTypes }) });
  }, [direction, relationshipTypes, layers, elementTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNodeId = state.selection.selectedNodeId ?? seedId;
  const canExpand = Boolean(selectedNodeId && model.elements[selectedNodeId]);

  const runExpand = (dirOverride?: 'incoming' | 'outgoing' | 'both') => {
    if (!canExpand) return;
    const nodeId = selectedNodeId;

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
              <label>Expand</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="miniLinkButton" onClick={() => runExpand('incoming')} disabled={!canExpand}>
                  + Upstream
                </button>
                <button type="button" className="miniLinkButton" onClick={() => runExpand('outgoing')} disabled={!canExpand}>
                  + Downstream
                </button>
                <button type="button" className="miniLinkButton" onClick={() => runExpand('both')} disabled={!canExpand}>
                  + Both
                </button>
              </div>
            </div>

            <div className="toolbarGroup">
              <label>Actions</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => dispatch({ type: 'togglePin', nodeId: selectedNodeId })}
                  disabled={!canExpand}
                >
                  {state.nodesById[selectedNodeId]?.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => dispatch({ type: 'collapseNode', nodeId: selectedNodeId })}
                  disabled={!canExpand}
                >
                  Collapse
                </button>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() =>
                    dispatch({ type: 'reset', seedIds: [seedId], options: { filters: state.filters } })
                  }
                >
                  Reset
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
        model={model}
        modelKind={modelKind}
        nodesById={state.nodesById}
        edgesById={state.edgesById}
        selection={state.selection}
        onSelectNode={(id) => dispatch({ type: 'selectNode', nodeId: id })}
        onSelectEdge={(id) => dispatch({ type: 'selectEdge', edgeId: id })}
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
            <table className="crudTable" style={{ margin: 0 }}>
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
                      onClick={() => dispatch({ type: 'selectNode', nodeId: n.id })}
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
