import { useEffect, useState } from 'react';

import type { AnalysisPath, Model, PathsBetweenResult, RelatedElementsResult, TraversalStep } from '../../domain';
import type { AnalysisMode } from './AnalysisQueryPanel';
import type { Selection } from '../model/selection';

import { AnalysisMiniGraph } from './AnalysisMiniGraph';

import '../../styles/crud.css';

type Props = {
  model: Model;
  mode: AnalysisMode;
  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  selection: Selection;
  onSelectRelationship: (relationshipId: string) => void;
  onSelectElement: (elementId: string) => void;
};

function nameFor(model: Model, id: string): string {
  const e = model.elements[id];
  return e?.name || '(unnamed)';
}

function typeFor(model: Model, id: string): string {
  const e = model.elements[id];
  return e?.type ? String(e.type) : '';
}

function layerFor(model: Model, id: string): string {
  const e = model.elements[id];
  return e?.layer ? String(e.layer) : '';
}

function stepSummary(model: Model, s: TraversalStep): string {
  const from = nameFor(model, s.fromId);
  const to = nameFor(model, s.toId);
  const type = String(s.relationshipType);
  const rev = s.reversed ? ' (reversed)' : '';
  return `${from} —[${type}]→ ${to}${rev}`;
}

function pathTitle(model: Model, p: AnalysisPath): string {
  const a = nameFor(model, p.elementIds[0] || '');
  const b = nameFor(model, p.elementIds[p.elementIds.length - 1] || '');
  const hops = Math.max(0, p.elementIds.length - 1);
  return `${a} → ${b} (${hops} hops)`;
}

export function AnalysisResultTable({
  model,
  mode,
  relatedResult,
  pathsResult,
  selection,
  onSelectRelationship,
  onSelectElement
}: Props) {
  const [showGraph, setShowGraph] = useState(false);

  // Auto-enable the graph once results appear (but don't force it back on if the user turns it off).
  useEffect(() => {
    if (showGraph) return;
    if (mode === 'related') {
      if ((relatedResult?.hits?.length ?? 0) > 0) setShowGraph(true);
      return;
    }
    if ((pathsResult?.paths?.length ?? 0) > 0) setShowGraph(true);
  }, [mode, relatedResult, pathsResult, showGraph]);

  if (mode === 'related') {
    const hits = relatedResult?.hits ?? [];
    const startId = relatedResult?.startElementId;

    return (
      <section className="crudSection" aria-label="Analysis results">
        <div className="crudHeader">
          <div style={{ flex: 1 }}>
            <p className="crudTitle">Results</p>
            <p className="crudHint">
              {startId
                ? `Elements related to “${nameFor(model, startId)}”.`
                : 'Run an analysis to see results.'}
            </p>
          </div>
          <div className="rowActions">
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setShowGraph((v) => !v)}
              disabled={hits.length === 0}
              aria-disabled={hits.length === 0}
            >
              {showGraph ? 'Hide graph' : 'Show graph'}
            </button>
          </div>
        </div>

        {hits.length === 0 ? (
          <p className="crudHint" style={{ marginTop: 10 }}>
            No related elements found (or no query has been run yet).
          </p>
        ) : (
          <table className="dataTable" aria-label="Related elements">
            <thead>
              <tr>
                <th>Distance</th>
                <th>Name</th>
                <th>Type</th>
                <th>Layer</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.elementId}>
                  <td className="mono">{h.distance}</td>
                  <td>{nameFor(model, h.elementId)}</td>
                  <td className="mono">{typeFor(model, h.elementId)}</td>
                  <td>{layerFor(model, h.elementId)}</td>
                  <td>
                    <div className="rowActions">
                      <button
                        type="button"
                        className="miniLinkButton"
                        onClick={() => onSelectElement(h.elementId)}
                      >
                        Select
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showGraph ? (
          <AnalysisMiniGraph
            model={model}
            mode={mode}
            relatedResult={relatedResult}
            pathsResult={null}
            selection={selection}
            onSelectRelationship={onSelectRelationship}
            onSelectElement={onSelectElement}
          />
        ) : null}
      </section>
    );
  }

  const res = pathsResult;
  const paths = res?.paths ?? [];
  const sourceId = res?.sourceElementId;
  const targetId = res?.targetElementId;
  const shortest = res?.shortestDistance;

  return (
    <section className="crudSection" aria-label="Analysis results">
      <div className="crudHeader">
        <div style={{ flex: 1 }}>
          <p className="crudTitle">Results</p>
          <p className="crudHint">
            {sourceId && targetId
              ? `Connection between “${nameFor(model, sourceId)}” and “${nameFor(model, targetId)}”.`
              : 'Run an analysis to see results.'}
          </p>
          {shortest !== undefined ? (
            <p className="crudHint" style={{ marginTop: 6 }}>
              Shortest distance: <span className="mono">{shortest}</span> hops.
            </p>
          ) : null}
        </div>
        <div className="rowActions">
          <button
            type="button"
            className="miniLinkButton"
            onClick={() => setShowGraph((v) => !v)}
            disabled={paths.length === 0}
            aria-disabled={paths.length === 0}
          >
            {showGraph ? 'Hide graph' : 'Show graph'}
          </button>
        </div>
      </div>

      {paths.length === 0 ? (
        <p className="crudHint" style={{ marginTop: 10 }}>
          No connection paths found (or no query has been run yet).
        </p>
      ) : (
        <table className="dataTable" aria-label="Connection paths">
          <thead>
            <tr>
              <th>Hops</th>
              <th>Path</th>
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {paths.map((p, idx) => {
              const hops = Math.max(0, p.elementIds.length - 1);
              const title = pathTitle(model, p);
              const first = p.elementIds[0];
              const last = p.elementIds[p.elementIds.length - 1];

              return (
                <tr key={idx}>
                  <td className="mono">{hops}</td>
                  <td>
                    <details>
                      <summary>{title}</summary>
                      <ol style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                        {p.steps.map((s) => (
                          <li key={`${s.relationshipId}:${s.fromId}->${s.toId}`}>{stepSummary(model, s)}</li>
                        ))}
                      </ol>
                    </details>
                  </td>
                  <td>
                    <div className="rowActions">
                      {first ? (
                        <button
                          type="button"
                          className="miniLinkButton"
                          onClick={() => onSelectElement(first)}
                        >
                          Select source
                        </button>
                      ) : null}
                      {last ? (
                        <button
                          type="button"
                          className="miniLinkButton"
                          onClick={() => onSelectElement(last)}
                        >
                          Select target
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showGraph ? (
        <AnalysisMiniGraph
          model={model}
          mode={mode}
          relatedResult={null}
          pathsResult={pathsResult}
          selection={selection}
          onSelectRelationship={onSelectRelationship}
          onSelectElement={onSelectElement}
        />
      ) : null}
    </section>
  );
}
