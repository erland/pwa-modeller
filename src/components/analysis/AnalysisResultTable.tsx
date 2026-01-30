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
import { loadAnalysisUiState, mergeAnalysisUiState } from './analysisUiStateStorage';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';

import { AnalysisSection } from './layout/AnalysisSection';

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

function escapeCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
  const modelId = model.id ?? '';
  const [showGraph, setShowGraph] = useState(false);
  const [graphOptions, setGraphOptions] = useState(defaultMiniGraphOptions);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [showAllPathsInMiniGraph, setShowAllPathsInMiniGraph] = useState(false);

  // Step 9: restore + persist mini-graph UI options per model.
  useEffect(() => {
    if (!modelId) return;
    const ui = loadAnalysisUiState(modelId);
    if (ui?.miniGraphOptions) {
      setGraphOptions({ ...defaultMiniGraphOptions, ...ui.miniGraphOptions, wrapLabels: true, autoFitColumns: true });
    }
  }, [modelId]);

  useEffect(() => {
    if (!modelId) return;
    mergeAnalysisUiState(modelId, { miniGraphOptions: graphOptions });
  }, [modelId, graphOptions]);

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

  const modelName = model.metadata?.name || 'model';

  const exportRelatedCsv = (): void => {
    const hits = relatedResult?.hits ?? [];
    if (hits.length === 0) return;
    const startId = relatedResult?.startElementId ?? '';
    const fileBase = `${modelName}-analysis-related${startId ? `-${nodeLabel(startId)}` : ''}`;
    const lines: string[] = [];
    lines.push(['distance', 'elementId', 'name', 'type', 'layer'].map(escapeCsvValue).join(','));
    for (const h of hits) {
      lines.push(
        [h.distance, h.elementId, nodeLabel(h.elementId), nodeType(h.elementId), nodeLayer(h.elementId)]
          .map(escapeCsvValue)
          .join(',')
      );
    }
    downloadTextFile(sanitizeFileNameWithExtension(fileBase, 'csv'), lines.join('\n'), 'text/csv');
  };

  const exportPathsCsv = (): void => {
    const paths = pathsResult?.paths ?? [];
    if (paths.length === 0) return;
    const fileBase = `${modelName}-analysis-paths`;
    const lines: string[] = [];
    lines.push(
      ['pathIndex', 'hopIndex', 'fromId', 'fromName', 'relationshipId', 'relationshipType', 'toId', 'toName']
        .map(escapeCsvValue)
        .join(',')
    );
    for (let pi = 0; pi < paths.length; pi++) {
      const p = paths[pi];
      for (let hi = 0; hi < p.steps.length; hi++) {
        const s = p.steps[hi];
        lines.push(
          [
            pi + 1,
            hi + 1,
            s.fromId,
            nodeLabel(s.fromId),
            s.relationshipId,
            s.relationshipType,
            s.toId,
            nodeLabel(s.toId)
          ]
            .map(escapeCsvValue)
            .join(',')
        );
      }
    }
    downloadTextFile(sanitizeFileNameWithExtension(fileBase, 'csv'), lines.join('\n'), 'text/csv');
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

  // When a new connection query runs, default-highlight the first returned path.
  useEffect(() => {
    if (mode !== 'paths') return;
    const p = pathsResult?.paths ?? [];
    if (p.length === 0) {
      setSelectedPathIndex(null);
      return;
    }
    // Reset to the first path whenever endpoints or result set changes.
    setSelectedPathIndex(0);
  }, [mode, pathsResult?.sourceElementId, pathsResult?.targetElementId, pathsResult?.paths?.length]);

  if (mode === 'related') {
    const hits = relatedResult?.hits ?? [];
    const startId = relatedResult?.startElementId;

    return (
      <AnalysisSection
        title="Results"
        hint={
          startId
            ? `Elements related to “${nodeLabel(startId)}”.`
            : 'Run an analysis to see results.'
        }
        actions={
          <>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => setShowGraph((v) => !v)}
              disabled={hits.length === 0}
              aria-disabled={hits.length === 0}
            >
              {showGraph ? 'Hide graph' : 'Show graph'}
            </button>

            {/* Step 7/9: mini-graph overlay options (degree/reach/property) and sizing, persisted per model */}
            <MiniGraphOptionsToggles options={graphOptions} onChange={setGraphOptions} availablePropertyKeys={availablePropertyKeys} />

            <button
              type="button"
              className="miniLinkButton"
              onClick={exportRelatedCsv}
              disabled={hits.length === 0}
              aria-disabled={hits.length === 0}
              title="Export the related-elements table as CSV"
            >
              Export CSV
            </button>
          </>
        }
      >

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
            wrapLabels={true}
            autoFitColumns={true}
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
      </AnalysisSection>
    );
  }

  const res = pathsResult;
  const paths = res?.paths ?? [];
  const sourceId = res?.sourceElementId;
  const targetId = res?.targetElementId;
  const shortest = res?.shortestDistance;

  const safeSelectedIndex =
    selectedPathIndex === null ? null : selectedPathIndex >= 0 && selectedPathIndex < paths.length ? selectedPathIndex : null;
  const selectedPath = safeSelectedIndex === null ? null : paths[safeSelectedIndex];
  const graphPathsResult: PathsBetweenResult | null =
    !res
      ? null
      : showAllPathsInMiniGraph
        ? res
        : selectedPath
          ? { ...res, paths: [selectedPath] }
          : res;

  return (
    <AnalysisSection
      title="Results"
      hint={
        <>
          <div>
            {sourceId && targetId
              ? `Connection between “${nodeLabel(sourceId)}” and “${nodeLabel(targetId)}”.`
              : 'Run an analysis to see results.'}
          </div>
          {shortest !== undefined ? (
            <div style={{ marginTop: 6 }}>
              Shortest distance: <span className="mono">{shortest}</span> hops.
            </div>
          ) : null}
          {paths.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              Mini-graph: {(showAllPathsInMiniGraph || safeSelectedIndex === null)
                ? 'all paths'
                : `path #${safeSelectedIndex + 1} of ${paths.length}`}
            </div>
          ) : null}
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="miniLinkButton"
            onClick={() => setShowGraph((v) => !v)}
            disabled={paths.length === 0}
            aria-disabled={paths.length === 0}
          >
            {showGraph ? 'Hide graph' : 'Show graph'}
          </button>
          <button
            type="button"
            className="miniLinkButton"
            onClick={exportPathsCsv}
            disabled={paths.length === 0}
            aria-disabled={paths.length === 0}
            title="Export all paths (flattened steps) as CSV"
          >
            Export CSV
          </button>
          {paths.length > 1 ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }} title="When enabled, the mini-graph shows the union of all returned paths">
              <input
                type="checkbox"
                checked={showAllPathsInMiniGraph}
                onChange={(e) => setShowAllPathsInMiniGraph(e.target.checked)}
              />
              All paths in graph
            </label>
          ) : null}
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
        </>
      }
    >

      {paths.length === 0 ? (
        <p className="crudHint" style={{ marginTop: 10 }}>
          No connection paths found (or no query has been run yet).
        </p>
      ) : (
        <table className="dataTable" aria-label="Connection paths">
          <thead>
            <tr>
              <th style={{ width: 1 }}>Show</th>
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
                <tr
                  key={idx}
                  style={safeSelectedIndex === idx ? { outline: '2px solid var(--accent-3)', outlineOffset: '-2px' } : undefined}
                >
                  <td>
                    <input
                      type="radio"
                      name="analysis-selected-path"
                      checked={safeSelectedIndex === idx}
                      onChange={() => setSelectedPathIndex(idx)}
                      title="Highlight this path in the mini-graph"
                    />
                  </td>
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
          pathsResult={graphPathsResult}
          selection={selection}
          onSelectRelationship={onSelectRelationship}
          onSelectElement={onSelectElement}
          wrapLabels={true}
          autoFitColumns={true}
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
    </AnalysisSection>
  );
}
