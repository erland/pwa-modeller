import type { AnalysisDirection, RelationshipType, PathsBetweenResult } from '../../../domain';
import type { Model } from '../../../domain';
import type { ModelKind } from '../../../domain/types';
import type { Selection } from '../../model/selection';

import type { AnalysisMode } from '../AnalysisQueryPanel';
import { AnalysisMiniGraph } from '../AnalysisMiniGraph';
import type { MiniGraphOptions } from '../MiniGraphOptions';
import { MiniGraphOptionsToggles } from '../MiniGraphOptions';
import { AnalysisSection } from '../layout/AnalysisSection';

import type { AnalysisResultFormatters } from './analysisResultFormatters';
import { exportPathsCsv } from './analysisResultExport';

export type PathsResultsSectionProps = {
  model: Model;
  modelName: string;
  modelKind: ModelKind;
  mode: AnalysisMode;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  pathsResult: PathsBetweenResult | null;
  selection: Selection;

  showGraph: boolean;
  setShowGraph: (next: boolean | ((v: boolean) => boolean)) => void;

  graphOptions: MiniGraphOptions;
  setGraphOptions: (next: MiniGraphOptions | ((v: MiniGraphOptions) => MiniGraphOptions)) => void;
  availablePropertyKeys: string[];

  selectedPathIndex: number | null;
  setSelectedPathIndex: (v: number | null) => void;
  showAllPathsInMiniGraph: boolean;
  setShowAllPathsInMiniGraph: (v: boolean) => void;

  formatters: AnalysisResultFormatters;

  onSelectRelationship: (relationshipId: string) => void;
  onSelectElement: (elementId: string) => void;
  onOpenTraceability: (elementId: string) => void;

  onOpenSandbox?: (args: {
    elementIds: string[];
    relationshipIds?: string[];
    relationshipTypes?: string[];
    layout?: { mode: 'grid' | 'distance' | 'levels'; levelById?: Record<string, number>; orderById?: Record<string, number> };
  }) => void;

  setTooltip: (t: { x: number; y: number; title: string; lines: string[] } | null) => void;
};

export function PathsResultsSection(props: PathsResultsSectionProps) {
  const {
    model,
    modelName,
    modelKind,
    mode,
    direction,
    relationshipTypes,
    pathsResult,
    selection,
    showGraph,
    setShowGraph,
    graphOptions,
    setGraphOptions,
    availablePropertyKeys,
    selectedPathIndex,
    setSelectedPathIndex,
    showAllPathsInMiniGraph,
    setShowAllPathsInMiniGraph,
    formatters,
    onSelectRelationship,
    onSelectElement,
    onOpenTraceability,
    onOpenSandbox,
    setTooltip,
  } = props;

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
              ? `Connection between “${formatters.nodeLabel(sourceId)}” and “${formatters.nodeLabel(targetId)}”.`
              : 'Run an analysis to see results.'}
          </div>
          {shortest !== undefined ? (
            <div style={{ marginTop: 6 }}>
              Shortest distance: <span className="mono">{shortest}</span> hops.
            </div>
          ) : null}
          {paths.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              Mini-graph:{' '}
              {(showAllPathsInMiniGraph || safeSelectedIndex === null)
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
            onClick={() => exportPathsCsv({ modelName, pathsResult, formatters })}
            disabled={paths.length === 0}
            aria-disabled={paths.length === 0}
            title="Export all paths (flattened steps) as CSV"
          >
            Export CSV
          </button>

          {paths.length > 1 ? (
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}
              title="When enabled, the mini-graph shows the union of all returned paths"
            >
              <input
                type="checkbox"
                checked={showAllPathsInMiniGraph}
                onChange={(e) => setShowAllPathsInMiniGraph(e.target.checked)}
              />
              All paths in graph
            </label>
          ) : null}

          <MiniGraphOptionsToggles
            options={graphOptions}
            onChange={(next) => setGraphOptions(next)}
            availablePropertyKeys={availablePropertyKeys}
          />

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
              const title = formatters.pathTitle(p);
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
                          <li key={`${s.relationshipId}:${s.fromId}->${s.toId}`}>{formatters.stepSummary(s)}</li>
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
                            const tip = formatters.elementTooltip(first);
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
                            const tip = formatters.elementTooltip(last);
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
          onOpenInSandbox={onOpenSandbox ? (payload) => onOpenSandbox(payload) : undefined}
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
    </AnalysisSection>
  );
}
