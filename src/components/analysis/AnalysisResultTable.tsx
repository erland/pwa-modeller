import { useEffect, useMemo, useState } from 'react';

import type { AnalysisDirection, RelationshipType, AnalysisPath, Model, PathsBetweenResult, RelatedElementsResult, TraversalStep } from '../../domain';
import { discoverNumericPropertyKeys, getElementTypeLabel } from '../../domain';
import type { AnalysisEdge } from '../../domain/analysis/graph';
import type { ModelKind } from '../../domain/types';
import type { AnalysisMode } from './AnalysisQueryPanel';
import type { Selection } from '../model/selection';

import { getAnalysisAdapter } from '../../analysis/adapters/registry';

import { AnalysisMiniGraph } from './AnalysisMiniGraph';
import { defaultMiniGraphOptions, MiniGraphOptionsToggles } from './MiniGraphOptions';
import { QuickTooltip } from './QuickTooltip';

import '../../styles/crud.css';

type Props = {
  model: Model;
  modelKind: ModelKind;
  mode: AnalysisMode;

  relatedResult: RelatedElementsResult | null;
  pathsResult: PathsBetweenResult | null;
  selection: Selection;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  onSelectRelationship: (relationshipId: string) => void;
  onSelectElement: (elementId: string) => void;
  onOpenTraceability: (elementId: string) => void;
};

function docSnippet(doc: string | undefined): string {
  const t = (doc ?? '').trim();
  if (!t) return '';
  if (t.length <= 240) return t;
  return `${t.slice(0, 239)}…`;
}

function stringFacetValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(String).join(', ');
  return String(v);
}

function relationshipIsExplicitlyUndirected(s: TraversalStep): boolean {
  const attrs = s.relationship?.attrs as unknown as { isDirected?: boolean } | undefined;
  return attrs?.isDirected === false;
}

function edgeFromStep(s: TraversalStep): AnalysisEdge {
  return {
    relationshipId: s.relationshipId,
    relationshipType: s.relationshipType,
    relationship: s.relationship,
    fromId: s.fromId,
    toId: s.toId,
    reversed: s.reversed,
    undirected: relationshipIsExplicitlyUndirected(s)
  };
}

export function AnalysisResultTable({
  model,
  modelKind,
  mode,
  direction,
  relationshipTypes,
  relatedResult,
  pathsResult,
  selection,
  onSelectRelationship,
  onSelectElement,
  onOpenTraceability
}: Props) {
  const adapter = getAnalysisAdapter(modelKind);
  const [showGraph, setShowGraph] = useState(false);
  const [graphOptions, setGraphOptions] = useState(defaultMiniGraphOptions);

  const availablePropertyKeys = useMemo(() => discoverNumericPropertyKeys(model), [model]);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    lines: string[];
  } | null>(null);

  const elementTooltip = (elementId: string): { title: string; lines: string[] } | null => {
    const el = model.elements[elementId];
    if (!el) return null;
    const facets = adapter.getNodeFacetValues(el, model);
    const type = String((facets.elementType ?? facets.type ?? el.type) ?? '');
    const layer = String((facets.archimateLayer ?? el.layer) ?? '');
    const doc = docSnippet(el.documentation);
    const lines: string[] = [];
    if (type) lines.push(`Type: ${type}`);
    if (layer) lines.push(`Layer: ${layer}`);
    if (doc) lines.push(`Documentation: ${doc}`);
    return { title: el.name || '(unnamed)', lines };
  };

  const nodeLabel = (id: string): string => {
    const el = model.elements[id];
    if (!el) return '(missing)';
    return adapter.getNodeLabel(el, model);
  };

  const nodeType = (id: string): string => {
    const el = model.elements[id];
    if (!el) return '';
    const facets = adapter.getNodeFacetValues(el, model);
    const rawType = String((facets.type ?? facets.elementType ?? el.type) ?? '');
    return rawType ? getElementTypeLabel(rawType) : '';
  };

  const nodeLayer = (id: string): string => {
    const el = model.elements[id];
    if (!el) return '';
    const facets = adapter.getNodeFacetValues(el, model);
    return stringFacetValue(facets.archimateLayer ?? el.layer ?? '');
  };

  const edgeLabel = (s: TraversalStep): string => adapter.getEdgeLabel(edgeFromStep(s), model);
  const edgeIsDirected = (s: TraversalStep): boolean => adapter.isEdgeDirected(edgeFromStep(s), model);

  const stepSummary = (s: TraversalStep): string => {
    const from = nodeLabel(s.fromId);
    const to = nodeLabel(s.toId);
    const rel = edgeLabel(s);
    const directed = edgeIsDirected(s);
    const arrow = directed ? '→' : '—';
    const rev = s.reversed && directed ? ' (reversed)' : '';
    return `${from} —[${rel}]${arrow} ${to}${rev}`;
  };

  const pathTitle = (p: AnalysisPath): string => {
    const a = nodeLabel(p.elementIds[0] || '');
    const b = nodeLabel(p.elementIds[p.elementIds.length - 1] || '');
    const hops = Math.max(0, p.elementIds.length - 1);
    return `${a} → ${b} (${hops} hops)`;
  };

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
                ? `Elements related to “${nodeLabel(startId)}”.`
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
                <tr
                  key={h.elementId}
                  title={(() => {
                    const tip = elementTooltip(h.elementId);
                    return tip ? `${tip.title}\n${tip.lines.join('\n')}` : nodeLabel(h.elementId);
                  })()}
                >
                  <td className="mono">{h.distance}</td>
                  <td>{nodeLabel(h.elementId)}</td>
                  <td className="mono">{nodeType(h.elementId)}</td>
                  <td>{nodeLayer(h.elementId)}</td>
                  <td>
                    <div className="rowActions">
                      <button
                        type="button"
                        className="miniLinkButton"
                        onClick={(ev) => {
                          onSelectElement(h.elementId);
                          const tip = elementTooltip(h.elementId);
                          if (tip) setTooltip({ x: ev.clientX, y: ev.clientY, title: tip.title, lines: tip.lines });
                        }}
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        className="miniLinkButton"
                        onClick={() => onOpenTraceability(h.elementId)}
                        title="Open Traceability Explorer from this element"
                      >
                        Open traceability
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
            modelKind={modelKind}
            mode={mode}
            relatedResult={relatedResult}
            pathsResult={null}
            selection={selection}
            onSelectRelationship={onSelectRelationship}
            onSelectElement={onSelectElement}
            wrapLabels={graphOptions.wrapLabels}
            autoFitColumns={graphOptions.autoFitColumns}
            nodeOverlayMetricId={graphOptions.nodeOverlayMetricId}
            nodeOverlayReachDepth={graphOptions.nodeOverlayReachDepth}
            nodeOverlayPropertyKey={graphOptions.nodeOverlayPropertyKey}
            scaleNodesByOverlayScore={graphOptions.scaleNodesByOverlayScore}
            overlayDirection={direction}
            overlayRelationshipTypes={relationshipTypes}
          />
        ) : null}

        <QuickTooltip
          open={Boolean(tooltip)}
          x={tooltip?.x ?? 0}
          y={tooltip?.y ?? 0}
          title={tooltip?.title ?? ''}
          lines={tooltip?.lines ?? []}
          onClose={() => setTooltip(null)}
        />
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
              ? `Connection between “${nodeLabel(sourceId)}” and “${nodeLabel(targetId)}”.`
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
          <MiniGraphOptionsToggles options={graphOptions} onChange={setGraphOptions} availablePropertyKeys={availablePropertyKeys} />
          {sourceId ? (
            <button type="button" className="miniLinkButton" onClick={() => onOpenTraceability(sourceId)}>
              Trace from source
            </button>
          ) : null}
          {targetId ? (
            <button type="button" className="miniLinkButton" onClick={() => onOpenTraceability(targetId)}>
              Trace from target
            </button>
          ) : null}
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
              const title = pathTitle(p);
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
                          <li key={`${s.relationshipId}:${s.fromId}->${s.toId}`}>{stepSummary(s)}</li>
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
                          onClick={(ev) => {
                            onSelectElement(first);
                            const tip = elementTooltip(first);
                            if (tip) setTooltip({ x: ev.clientX, y: ev.clientY, title: tip.title, lines: tip.lines });
                          }}
                        >
                          Select source
                        </button>
                      ) : null}
                      {last ? (
                        <button
                          type="button"
                          className="miniLinkButton"
                          onClick={(ev) => {
                            onSelectElement(last);
                            const tip = elementTooltip(last);
                            if (tip) setTooltip({ x: ev.clientX, y: ev.clientY, title: tip.title, lines: tip.lines });
                          }}
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
          modelKind={modelKind}
          mode={mode}
          relatedResult={null}
          pathsResult={pathsResult}
          selection={selection}
          onSelectRelationship={onSelectRelationship}
          onSelectElement={onSelectElement}
          wrapLabels={graphOptions.wrapLabels}
          autoFitColumns={graphOptions.autoFitColumns}
          nodeOverlayMetricId={graphOptions.nodeOverlayMetricId}
          nodeOverlayReachDepth={graphOptions.nodeOverlayReachDepth}
          nodeOverlayPropertyKey={graphOptions.nodeOverlayPropertyKey}
          scaleNodesByOverlayScore={graphOptions.scaleNodesByOverlayScore}
          overlayDirection={direction}
          overlayRelationshipTypes={relationshipTypes}
        />
      ) : null}

      <QuickTooltip
        open={Boolean(tooltip)}
        x={tooltip?.x ?? 0}
        y={tooltip?.y ?? 0}
        title={tooltip?.title ?? ''}
        lines={tooltip?.lines ?? []}
        onClose={() => setTooltip(null)}
      />
    </section>
  );
}
