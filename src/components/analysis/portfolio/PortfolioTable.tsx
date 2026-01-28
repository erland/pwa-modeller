import { Fragment } from 'react';

import type { SortKey } from './types';
import { clamp01, formatMetricValue, toTestIdKey } from './utils';

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
  displayRows: Row[];
  grouped: Group[] | null;
  tableRows: Row[];
  hasLayerFacet: boolean;

  metricKey: string;
  metricRange: { min: number; max: number } | null;
  valueByElementId: Record<string, number | undefined>;

  showDegree: boolean;
  degreeByElementId: Record<string, number | undefined>;

  showReach3: boolean;
  reach3ByElementId: Record<string, number | undefined>;

  selectedElementId: string | null;
  onSelectElement: (elementId: string) => void;

  toggleSort: (k: SortKey) => void;
  sortIndicator: (k: SortKey) => string;

  groupBy: 'none' | 'type' | 'layer';
};

export function PortfolioTable({
  displayRows,
  grouped,
  tableRows,
  hasLayerFacet,
  metricKey,
  metricRange,
  valueByElementId,
  showDegree,
  degreeByElementId,
  showReach3,
  reach3ByElementId,
  selectedElementId,
  onSelectElement,
  toggleSort,
  sortIndicator,
  groupBy
}: Props) {
  if (displayRows.length === 0) {
    return (
      <p className="crudHint" style={{ marginTop: 10 }}>
        No elements match the current filters.
      </p>
    );
  }

  return (
    <table className="dataTable" aria-label="Portfolio population table">
      <thead>
        <tr>
          <th>
            <button type="button" className="miniLinkButton" onClick={() => toggleSort('name')} title="Sort by name">
              Name{sortIndicator('name')}
            </button>
          </th>
          <th>
            <button type="button" className="miniLinkButton" onClick={() => toggleSort('type')} title="Sort by type">
              Type{sortIndicator('type')}
            </button>
          </th>
          {hasLayerFacet ? (
            <th>
              <button type="button" className="miniLinkButton" onClick={() => toggleSort('layer')} title="Sort by layer">
                Layer{sortIndicator('layer')}
              </button>
            </th>
          ) : null}
          <th style={{ textAlign: 'right' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => toggleSort('metric')}
              title={metricKey ? `Sort by numeric property: ${metricKey}` : 'Choose a numeric property key to enable metric sorting'}
              disabled={!metricKey}
              aria-disabled={!metricKey}
            >
              Metric{sortIndicator('metric')}
            </button>
          </th>
          {showDegree ? (
            <th style={{ textAlign: 'right' }}>
              <button type="button" className="miniLinkButton" onClick={() => toggleSort('degree')} title="Sort by degree">
                Degree{sortIndicator('degree')}
              </button>
            </th>
          ) : null}
          {showReach3 ? (
            <th style={{ textAlign: 'right' }}>
              <button type="button" className="miniLinkButton" onClick={() => toggleSort('reach3')} title="Sort by reach within 3 steps">
                Reach(3){sortIndicator('reach3')}
              </button>
            </th>
          ) : null}
          <th style={{ width: 1 }} />
        </tr>
      </thead>

      <tbody>
        {grouped
          ? grouped.map((g) => {
              const colSpan =
                1 +
                1 +
                (hasLayerFacet ? 1 : 0) +
                1 +
                (showDegree ? 1 : 0) +
                (showReach3 ? 1 : 0) +
                1;

              const metricLabel = metricKey ? metricKey : 'metric';
              const sumText = g.rollup.sum !== null ? formatMetricValue(g.rollup.sum) : '';
              const avgText = g.rollup.avg !== null ? formatMetricValue(g.rollup.avg) : '';

              return (
                <Fragment key={`group-${groupBy}-${g.key}`}>
                  <tr data-testid={`portfolio-group-${groupBy}-${toTestIdKey(g.key)}`} style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <td colSpan={colSpan}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>{g.key}</span>
                        <span className="crudHint" style={{ margin: 0 }}>
                          Count: <span className="mono">{g.rollup.count}</span>
                          {metricKey ? (
                            <>
                              {' '}• Sum {metricLabel}: <span className="mono">{sumText || '—'}</span>
                              {' '}• Avg: <span className="mono">{avgText || '—'}</span>
                              {' '}• Missing: <span className="mono">{g.rollup.missing}</span>
                            </>
                          ) : null}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {g.rows.map((r) => {
                    const v = metricKey ? valueByElementId[r.elementId] : undefined;
                    const range = metricRange;
                    const intensity =
                      metricKey && v !== undefined && range
                        ? range.max === range.min
                          ? 1
                          : clamp01((v - range.min) / (range.max - range.min))
                        : 0;
                    const heatAlpha = intensity > 0 ? 0.18 * intensity : 0;
                    const heatmapBg = heatAlpha > 0 ? `rgba(var(--analysis-heatmap-fill-rgb), ${heatAlpha})` : undefined;

                    return (
                      <tr key={r.elementId} style={selectedElementId === r.elementId ? { background: 'rgba(255,255,255,0.04)' } : undefined}>
                        <td>{r.label}</td>
                        <td className="mono">{r.typeLabel}</td>
                        {hasLayerFacet ? <td>{r.layerLabel ?? ''}</td> : null}
                        <td
                          className="mono"
                          style={{ textAlign: 'right', background: heatmapBg, opacity: metricKey && v === undefined ? 0.6 : 1 }}
                          data-heat={intensity > 0 ? intensity.toFixed(3) : undefined}
                        >
                          {metricKey ? (v === undefined ? '—' : formatMetricValue(v)) : '—'}
                        </td>
                        {showDegree ? (
                          <td className="mono" style={{ textAlign: 'right', opacity: degreeByElementId[r.elementId] === undefined ? 0.6 : 1 }}>
                            {degreeByElementId[r.elementId] ?? '—'}
                          </td>
                        ) : null}
                        {showReach3 ? (
                          <td className="mono" style={{ textAlign: 'right', opacity: reach3ByElementId[r.elementId] === undefined ? 0.6 : 1 }}>
                            {reach3ByElementId[r.elementId] ?? '—'}
                          </td>
                        ) : null}
                        <td>
                          <div className="rowActions">
                            <button type="button" className="miniLinkButton" onClick={() => onSelectElement(r.elementId)}>
                              Select
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })
          : tableRows.map((r) => {
              const v = metricKey ? valueByElementId[r.elementId] : undefined;
              const range = metricRange;
              const intensity =
                metricKey && v !== undefined && range ? (range.max === range.min ? 1 : clamp01((v - range.min) / (range.max - range.min))) : 0;
              const heatAlpha = intensity > 0 ? 0.18 * intensity : 0;
              const heatmapBg = heatAlpha > 0 ? `rgba(var(--analysis-heatmap-fill-rgb), ${heatAlpha})` : undefined;

              return (
                <tr key={r.elementId} style={selectedElementId === r.elementId ? { background: 'rgba(255,255,255,0.04)' } : undefined}>
                  <td>{r.label}</td>
                  <td className="mono">{r.typeLabel}</td>
                  {hasLayerFacet ? <td>{r.layerLabel ?? ''}</td> : null}
                  <td
                    className="mono"
                    style={{ textAlign: 'right', background: heatmapBg, opacity: metricKey && v === undefined ? 0.6 : 1 }}
                    data-heat={intensity > 0 ? intensity.toFixed(3) : undefined}
                  >
                    {metricKey ? (v === undefined ? '—' : formatMetricValue(v)) : '—'}
                  </td>
                  {showDegree ? (
                    <td className="mono" style={{ textAlign: 'right', opacity: degreeByElementId[r.elementId] === undefined ? 0.6 : 1 }}>
                      {degreeByElementId[r.elementId] ?? '—'}
                    </td>
                  ) : null}
                  {showReach3 ? (
                    <td className="mono" style={{ textAlign: 'right', opacity: reach3ByElementId[r.elementId] === undefined ? 0.6 : 1 }}>
                      {reach3ByElementId[r.elementId] ?? '—'}
                    </td>
                  ) : null}
                  <td>
                    <div className="rowActions">
                      <button type="button" className="miniLinkButton" onClick={() => onSelectElement(r.elementId)}>
                        Select
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );
}
