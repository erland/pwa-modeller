import type { AnalysisDirection, RelationshipType, Model, RelatedElementsResult } from '../../../domain';
import type { ModelKind } from '../../../domain/types';
import type { Selection } from '../../model/selection';

import { AnalysisMiniGraph } from '../AnalysisMiniGraph';
import type { AnalysisMode } from '../AnalysisQueryPanel';
import type { MiniGraphOptions } from '../MiniGraphOptions';
import { MiniGraphOptionsToggles } from '../MiniGraphOptions';
import type { AnalysisResultFormatters } from './analysisResultFormatters';
import { exportRelatedCsv } from './analysisResultExport';

import { AnalysisSection } from '../layout/AnalysisSection';

export type RelatedResultsSectionProps = {
  model: Model;
  modelName: string;
  modelKind: ModelKind;
  mode: AnalysisMode;
  direction: AnalysisDirection;
  relationshipTypes: RelationshipType[];
  relatedResult: RelatedElementsResult | null;
  selection: Selection;

  showGraph: boolean;
  setShowGraph: (next: boolean | ((v: boolean) => boolean)) => void;

  graphOptions: MiniGraphOptions;
  setGraphOptions: (next: MiniGraphOptions | ((v: MiniGraphOptions) => MiniGraphOptions)) => void;
  availablePropertyKeys: string[];

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

export function RelatedResultsSection(props: RelatedResultsSectionProps) {
  const {
    model,
    modelName,
    modelKind,
    mode,
    direction,
    relationshipTypes,
    relatedResult,
    selection,
    showGraph,
    setShowGraph,
    graphOptions,
    setGraphOptions,
    availablePropertyKeys,
    formatters,
    onSelectRelationship,
    onSelectElement,
    onOpenTraceability,
    onOpenSandbox,
    setTooltip,
  } = props;

  const hits = relatedResult?.hits ?? [];
  const startId = relatedResult?.startElementId;

  return (
    <AnalysisSection
      title="Results"
      hint={startId ? `Elements related to “${formatters.nodeLabel(startId)}”.` : 'Run an analysis to see results.'}
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

          <MiniGraphOptionsToggles
            options={graphOptions}
            onChange={(next) => setGraphOptions(next)}
            availablePropertyKeys={availablePropertyKeys}
          />

          <button
            type="button"
            className="miniLinkButton"
            onClick={() => exportRelatedCsv({ modelName, relatedResult, formatters })}
            disabled={hits.length === 0}
            aria-disabled={hits.length === 0}
            title="Export the related-elements table as CSV"
          >
            Export CSV
          </button>

          {onOpenSandbox ? (
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => {
                const hits = relatedResult?.hits ?? [];
                const startId = relatedResult?.startElementId;
                const elementIds = Array.from(
                  new Set([...(startId ? [startId] : []), ...hits.map((h) => h.elementId)].filter(Boolean))
                ) as string[];
                const levelById: Record<string, number> = {};
                if (startId) levelById[startId] = 0;
                for (const h of hits) levelById[h.elementId] = h.distance ?? 1;
                const relationshipTypesSeed = relationshipTypes && relationshipTypes.length ? relationshipTypes : undefined;

                onOpenSandbox({
                  elementIds,
                  relationshipTypes: relationshipTypesSeed,
                  layout: { mode: 'distance', levelById },
                });
              }}
              disabled={(relatedResult?.hits?.length ?? 0) === 0 && !relatedResult?.startElementId}
              aria-disabled={(relatedResult?.hits?.length ?? 0) === 0 && !relatedResult?.startElementId}
              title="Open these results as a Sandbox"
            >
              Open in Sandbox
            </button>
          ) : null}
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
                  const tip = formatters.elementTooltip(h.elementId);
                  return tip ? `${tip.title}\n${tip.lines.join('\n')}` : formatters.nodeLabel(h.elementId);
                })()}
              >
                <td className="mono">{h.distance}</td>
                <td>{formatters.nodeLabel(h.elementId)}</td>
                <td className="mono">{formatters.nodeType(h.elementId)}</td>
                <td>{formatters.nodeLayer(h.elementId)}</td>
                <td>
                  <div className="rowActions">
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={(ev) => {
                        onSelectElement(h.elementId);
                        const tip = formatters.elementTooltip(h.elementId);
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
