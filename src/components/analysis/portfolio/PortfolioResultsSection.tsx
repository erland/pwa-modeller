import { AnalysisSection } from '../layout/AnalysisSection';
import { PortfolioTable } from './PortfolioTable';
import type { GroupBy, SortDir, SortKey } from './types';
import { formatMetricValue } from './utils';

type Row = {
  elementId: string;
  label: string;
  typeLabel: string;
  layerLabel?: string | null;
};

type Group = {
  key: string;
  rows: Row[];
  rollup: { count: number; sum: number | null; avg: number | null; missing: number };
};

type Props = {
  metricKey: string;
  metricRange: { min: number; max: number } | null;

  completeness: { total: number; present: number; missing: number; percent: number | null };

  displayRows: Row[];
  grouped: Group[] | null;
  tableRows: Row[];

  hasLayerFacet: boolean;

  showDegree: boolean;
  showReach3: boolean;

  degreeByElementId: Record<string, number | undefined>;
  reach3ByElementId: Record<string, number | undefined>;
  valueByElementId: Record<string, number | undefined>;

  selectedElementId: string | null;
  onSelectElement: (id: string) => void;

  sortKey: SortKey;
  sortDir: SortDir;
  groupBy: GroupBy;

  toggleSort: (k: SortKey) => void;
  sortIndicator: (k: SortKey) => string;

  exportCsv: () => void;
};

export function PortfolioResultsSection({
  metricKey,
  metricRange,
  completeness,
  displayRows,
  grouped,
  tableRows,
  hasLayerFacet,
  showDegree,
  showReach3,
  degreeByElementId,
  reach3ByElementId,
  valueByElementId,
  selectedElementId,
  onSelectElement,
  sortKey,
  sortDir,
  groupBy,
  toggleSort,
  sortIndicator,
  exportCsv
}: Props) {
  const resultsActions = (
    <button
      type="button"
      className="shellButton"
      onClick={exportCsv}
      disabled={tableRows.length === 0}
      aria-disabled={tableRows.length === 0}
      title="Export the portfolio table as CSV"
    >
      Export CSV
    </button>
  );

  const resultsHint =
    `Showing ${tableRows.length} element${tableRows.length === 1 ? '' : 's'}.` +
    (grouped ? ` Grouped by ${groupBy}.` : '') +
    ` Sorted by ${sortKey} (${sortDir}).`;

  return (
    <AnalysisSection title="Results" hint={resultsHint} actions={resultsActions}>
      {metricKey && metricRange ? (
        <div style={{ marginTop: 10 }}>
          <div className="analysisHeatLegend" title="Heat scale">
            <span>
              Low (<span className="mono">{formatMetricValue(metricRange.min)}</span>)
            </span>
            <div className="analysisHeatLegendBar" aria-hidden="true" />
            <span>
              High (<span className="mono">{formatMetricValue(metricRange.max)}</span>)
            </span>
          </div>
        </div>
      ) : null}

      <div
        aria-label="Portfolio completeness summary"
        style={{
          marginTop: 10,
          padding: '8px 10px',
          border: '1px solid var(--border-1)',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span>
            Population: <span className="mono" data-testid="portfolio-completeness-total">{completeness.total}</span>
          </span>
          {metricKey ? (
            <>
              <span>
                Has <span className="mono">{metricKey}</span>:{' '}
                <span className="mono" data-testid="portfolio-completeness-present">{completeness.present}</span>{' '}
                (<span className="mono" data-testid="portfolio-completeness-percent">{completeness.percent}%</span>)
              </span>
              <span>
                Missing: <span className="mono" data-testid="portfolio-completeness-missing">{completeness.missing}</span>
              </span>
            </>
          ) : (
            <span className="crudHint" style={{ margin: 0 }}>
              Choose a primary metric to see completeness.
            </span>
          )}
        </div>
      </div>

      <PortfolioTable
        displayRows={displayRows}
        grouped={grouped}
        tableRows={tableRows}
        hasLayerFacet={hasLayerFacet}
        metricKey={metricKey}
        metricRange={metricRange}
        valueByElementId={valueByElementId}
        showDegree={showDegree}
        degreeByElementId={degreeByElementId}
        showReach3={showReach3}
        reach3ByElementId={reach3ByElementId}
        selectedElementId={selectedElementId}
        onSelectElement={onSelectElement}
        toggleSort={toggleSort}
        sortIndicator={sortIndicator}
        groupBy={groupBy}
      />
    </AnalysisSection>
  );
}
