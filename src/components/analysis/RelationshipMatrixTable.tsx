import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';

import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import type { MatrixMetricId } from '../../domain/analysis/metrics';
import { exportRelationshipMatrixCsv, exportRelationshipMatrixMissingLinksCsv } from './exportRelationshipMatrixCsv';
import { AnalysisSection } from './layout/AnalysisSection';

export interface RelationshipMatrixTableProps {
  modelName: string;
  result: RelationshipMatrixResult;

  /** Which numeric metric (if any) to display in each cell. */
  cellMetricId: 'off' | MatrixMetricId;
  onChangeCellMetricId: (v: 'off' | MatrixMetricId) => void;

  /** Optional: relationship-type weights used when cellMetricId === 'matrixWeightedCount'. */
  weightsByRelationshipType?: Record<string, number>;
  onChangeRelationshipTypeWeight?: (relationshipType: string, weight: number) => void;
  weightPresets?: Array<{ id: string; label: string }>;
  weightPresetId?: string;
  onChangeWeightPresetId?: (presetId: string) => void;
  /** Relationship types to display in the weights editor (order preserved). */
  relationshipTypesForWeights?: string[];

  /**
   * Optional precomputed metric values (cells[rowIndex][colIndex]).
   * When provided, values will be used instead of result.cells[].count.
   */
  cellValues?: number[][];
  /** If true, visually highlight 0-count cells. */
  highlightMissing: boolean;
  onToggleHighlightMissing: () => void;

  /** Step 9: persisted view toggles. */
  heatmapEnabled: boolean;
  onChangeHeatmapEnabled: (v: boolean) => void;
  hideEmpty: boolean;
  onChangeHideEmpty: (v: boolean) => void;

  /** Optional: open a drill-down inspector for a specific cell. */
  onOpenCell?: (args: {
    rowId: string;
    rowLabel: string;
    colId: string;
    colLabel: string;
    relationshipIds: string[];
  }) => void;
}

function formatTotal(n: number): string {
  return String(n);
}

function formatCellValue(n: number): string {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function RelationshipMatrixTable({
  modelName,
  result,
  cellMetricId,
  onChangeCellMetricId,
  weightsByRelationshipType,
  onChangeRelationshipTypeWeight,
  weightPresets,
  weightPresetId,
  onChangeWeightPresetId,
  relationshipTypesForWeights,
  cellValues,
  highlightMissing,
  onToggleHighlightMissing,
  heatmapEnabled,
  onChangeHeatmapEnabled,
  hideEmpty,
  onChangeHideEmpty,
  onOpenCell
}: RelationshipMatrixTableProps) {
  const { rows, cols, cells, rowTotals, colTotals, grandTotal } = result;

  // If cell values are disabled, heatmap shading doesn't make sense.
  useEffect(() => {
    if (cellMetricId === 'off' && heatmapEnabled) onChangeHeatmapEnabled(false);
  }, [cellMetricId, heatmapEnabled, onChangeHeatmapEnabled]);

  const maxCellCount = useMemo(() => {
    let max = 0;
    for (const row of cells) {
      for (const cell of row) {
        if (cell.count > max) max = cell.count;
      }
    }
    return max;
  }, [cells]);


  const baseValues: number[][] | undefined = useMemo(() => {
    if (cellMetricId === 'off') return undefined;
    if (cellValues && cellValues.length) return cellValues;
    // Fallback for count metric if caller didn't provide values.
    return cells.map((row) => row.map((c) => c.count));
  }, [cellMetricId, cellValues, cells]);

  const { displayRows, displayCols, displayCells, displayValues, displayRowTotals, displayColTotals } = useMemo(() => {
    if (!hideEmpty) {
      return {
        displayRows: rows,
        displayCols: cols,
        displayCells: cells,
        displayValues: baseValues,
        displayRowTotals: rowTotals,
        displayColTotals: colTotals
      };
    }

    const rowIdxs = rows
      .map((_, i) => i)
      .filter((i) => (rowTotals[i] ?? 0) > 0);

    const colIdxs = cols
      .map((_, i) => i)
      .filter((i) => (colTotals[i] ?? 0) > 0);

    const displayRows = rowIdxs.map((i) => rows[i]);
    const displayCols = colIdxs.map((i) => cols[i]);
    const displayRowTotals = rowIdxs.map((i) => rowTotals[i] ?? 0);
    const displayColTotals = colIdxs.map((i) => colTotals[i] ?? 0);

    const displayCells = rowIdxs.map((ri) => colIdxs.map((ci) => cells[ri][ci]));
    const displayValues = baseValues
      ? rowIdxs.map((ri) => colIdxs.map((ci) => baseValues[ri]?.[ci] ?? 0))
      : undefined;

    return { displayRows, displayCols, displayCells, displayValues, displayRowTotals, displayColTotals };
  }, [baseValues, cells, colTotals, cols, hideEmpty, rowTotals, rows]);

  const metricTotals = useMemo(() => {
    if (!displayValues) {
      const gt = (displayRowTotals ?? []).reduce((a, b) => a + (b ?? 0), 0);
      return {
        rowTotals: displayRowTotals,
        colTotals: displayColTotals,
        grandTotal: gt,
      };
    }

    const rowTotals = displayValues.map((row) => row.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0));
    const colTotals = displayCols.map((_, ci) =>
      displayValues.reduce((sum, row) => sum + (Number.isFinite(row[ci]) ? row[ci] : 0), 0)
    );
    const grandTotal = rowTotals.reduce((a, b) => a + b, 0);
    return { rowTotals, colTotals, grandTotal };
  }, [displayColTotals, displayCols, displayRowTotals, displayValues]);

  const heatmapMaxValue = useMemo(() => {
    if (!heatmapEnabled) return 0;
    if (cellMetricId === 'off') return 0;
    if (!displayValues) return 0;
    let max = 0;
    for (const row of displayValues) {
      for (const v of row) {
        if (Number.isFinite(v) && v > max) max = v;
      }
    }
    return max;
  }, [cellMetricId, displayValues, heatmapEnabled]);

  const cellBorderStyle: CSSProperties = { border: '1px solid var(--diagram-grid-line)' };

  const hint = (
    <>
      Relationship matrix. Rows: <span className="mono">{rows.length}</span>, Columns: <span className="mono">{cols.length}</span>, Total
      links: <span className="mono">{formatTotal(grandTotal)}</span>
      {cellMetricId !== 'off' ? (
        <>
          , Total value: <span className="mono">{formatCellValue(metricTotals.grandTotal)}</span>
        </>
      ) : null}
      {maxCellCount > 0 ? (
        <>
          , Max cell: <span className="mono">{formatTotal(maxCellCount)}</span>
        </>
      ) : null}
    </>
  );

  const actions = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
            Preset
            <select
              className="selectInput"
              aria-label="Matrix preset"
              value={
                cellMetricId === 'off'
                  ? 'off'
                  : cellMetricId === 'matrixWeightedCount'
                    ? 'weighted'
                    : 'count'
              }
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === 'off') onChangeCellMetricId('off');
                else if (v === 'weighted') onChangeCellMetricId('matrixWeightedCount');
                else onChangeCellMetricId('matrixRelationshipCount');
              }}
              title="Quickly switch between common matrix value presets"
            >
              <option value="off">Off</option>
              <option value="count">Count</option>
              <option value="weighted">Weighted</option>
            </select>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
            Cell values
            <select
              className="selectInput"
              aria-label="Matrix cell values"
              value={cellMetricId}
              onChange={(e) => onChangeCellMetricId(e.currentTarget.value as 'off' | MatrixMetricId)}
              title="Which numeric value to show in each cell"
            >
              <option value="off">Off</option>
              <option value="matrixRelationshipCount">Relationship count</option>
              <option value="matrixWeightedCount">Weighted count</option>
            </select>
          </label>

          {cellMetricId === 'matrixWeightedCount' ? (
            <details style={{ fontSize: 12, opacity: 0.9 }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Weights</summary>
              <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border-1)', borderRadius: 12 }}>
                {weightPresets && weightPresets.length && onChangeWeightPresetId ? (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    Preset
                    <select
                      className="selectInput"
                      aria-label="Weight preset"
                      value={weightPresetId ?? 'default'}
                      onChange={(e) => onChangeWeightPresetId(e.currentTarget.value)}
                    >
                      {weightPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', paddingRight: 12 }}>Relationship type</th>
                        <th style={{ textAlign: 'right' }}>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(relationshipTypesForWeights && relationshipTypesForWeights.length
                        ? relationshipTypesForWeights
                        : Object.keys(weightsByRelationshipType ?? {}).sort((a, b) => a.localeCompare(b))
                      ).map((t) => (
                        <tr key={t}>
                          <td style={{ padding: '4px 12px 4px 0' }}>
                            <span className="mono">{t}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              step="0.1"
                              value={(weightsByRelationshipType?.[t] ?? 1).toString()}
                              onChange={(e) =>
                                onChangeRelationshipTypeWeight?.(t, Number.parseFloat(e.currentTarget.value))
                              }
                              style={{ width: 80 }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ marginTop: 8, opacity: 0.8 }}>
                  Types not listed use weight <span className="mono">1</span>.
                </p>
              </div>
            </details>
          ) : null}

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={heatmapEnabled}
              disabled={cellMetricId === 'off'}
              onChange={() => onChangeHeatmapEnabled(!heatmapEnabled)}
            />
            Heatmap shading
          </label>

          {heatmapEnabled && cellMetricId !== 'off' && heatmapMaxValue > 0 ? (
            <div className="analysisHeatLegend" title="Heatmap scale">
              <span>Low</span>
              <div className="analysisHeatLegendBar" aria-hidden="true" />
              <span>
                High (<span className="mono">{formatCellValue(heatmapMaxValue)}</span>)
              </span>
            </div>
          ) : null}

          <button
            type="button"
            className="shellButton"
            onClick={() => exportRelationshipMatrixCsv(modelName, result, baseValues)}
            title="Export the entire matrix as CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => exportRelationshipMatrixMissingLinksCsv(modelName, result)}
            title="Export all 0-count cells as a flat missing-links list"
          >
            Export missing links
          </button>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
            <input type="checkbox" checked={highlightMissing} onChange={onToggleHighlightMissing} />
            Highlight missing links (0)
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
            <input type="checkbox" checked={hideEmpty} onChange={() => onChangeHideEmpty(!hideEmpty)} />
            Hide empty rows/columns
          </label>

        </div>
  );

  return (
    <AnalysisSection title="Results" hint={hint} actions={actions}>
      <div
        style={{
          marginTop: 12,
          border: '1px solid var(--border-1)',
          borderRadius: 12,
          overflow: 'auto',
          maxHeight: '60vh',
          background: 'var(--surface-1)',
        }}
      >
        <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
                    <thead>
            <tr>
              <th
                style={{
                  ...cellBorderStyle,
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 4,
                  background: 'var(--surface-2)',
                  minWidth: 220,
                }}
              >
                Row \ Col
              </th>
              {displayCols.map((c) => (
                <th
                  key={c.id}
                  style={{
                    ...cellBorderStyle,
                    position: 'sticky',
                    top: 0,
                    zIndex: 3,
                    background: 'var(--surface-2)',
                    width: 44,
                    minWidth: 44,
                    maxWidth: 44,
                    height: 180,
                    padding: 0,
                    verticalAlign: 'bottom',
                    textAlign: 'center',
                  }}
                  title={c.label}
                >
                  <div
                    style={{
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                      whiteSpace: 'nowrap',
                      padding: '10px 6px',
                      lineHeight: 1.1,
                    }}
                  >
                    {c.label}
                  </div>
                </th>
              ))}
              <th
                style={{
                  ...cellBorderStyle,
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                  background: 'var(--surface-2)',
                  width: 44,
                  minWidth: 44,
                  maxWidth: 44,
                  height: 180,
                  padding: 0,
                  verticalAlign: 'bottom',
                  textAlign: 'center',
                }}
                title="Row total"
              >
                <div
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    whiteSpace: 'nowrap',
                    padding: '10px 6px',
                    lineHeight: 1.1,
                    fontWeight: 600,
                  }}
                >
                  Total
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, ri) => (
              <tr key={r.id}>
                <th
                  style={{
                    ...cellBorderStyle,
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: 'var(--surface-2)',
                    minWidth: 220,
                    maxWidth: 320,
                    textAlign: 'left',
                  }}
                  title={r.label}
                >
                  {r.label}
                </th>
                {displayCols.map((c, ci) => {
                  const cell = displayCells[ri][ci];
                  const isMissing = cell.count === 0;
                  const rawValue = displayValues ? (displayValues[ri]?.[ci] ?? 0) : cell.count;
                  const valueText =
                    cellMetricId === 'off' ? '' : rawValue ? formatCellValue(rawValue) : '';

                  const heatIntensity =
                    heatmapEnabled && cellMetricId !== 'off' && heatmapMaxValue > 0
                      ? Math.max(0, Math.min(1, rawValue / heatmapMaxValue))
                      : 0;
                  // Keep TS free from color choices; alpha is derived, base RGB comes from CSS vars.
                  const heatAlpha = heatIntensity > 0 ? 0.18 * heatIntensity : 0;
                  const heatmapBg =
                    heatAlpha > 0 ? `rgba(var(--analysis-heatmap-fill-rgb), ${heatAlpha})` : undefined;
                  return (
                    <td
                      key={c.id}
                      data-heat={heatIntensity > 0 ? heatIntensity.toFixed(3) : undefined}
                      style={{
                        ...cellBorderStyle,
                        textAlign: 'right',
                        padding: '8px 10px',
                        fontVariantNumeric: 'tabular-nums',
                        background:
                          heatmapBg ?? (highlightMissing && isMissing ? 'var(--analysis-matrix-missing-bg)' : undefined),
                        opacity: isMissing ? 0.7 : 1,
                      }}
                      title={cell.relationshipIds.length ? cell.relationshipIds.join('\n') : 'No links'}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCell?.({
                            rowId: r.id,
                            rowLabel: r.label,
                            colId: c.id,
                            colLabel: c.label,
                            relationshipIds: cell.relationshipIds,
                          })
                        }
                        aria-label={`Open cell details for ${r.label} → ${c.label}`}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'block',
                          width: '100%',
                          textAlign: 'right',
                          padding: 0,
                        }}
                      >
                        {valueText}
                      </button>
                    </td>
                  );
                })}
                <td style={{
                  ...cellBorderStyle, textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
                  {formatCellValue(metricTotals.rowTotals[ri] ?? 0)}
                </td>
              </tr>
            ))}
            <tr>
              <th
                style={{
                  ...cellBorderStyle,
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: 'var(--surface-2)',
                  textAlign: 'left',
                }}
              >
                Total
              </th>
              {displayCols.map((c, ci) => (
                <td
                  key={c.id}
                  style={{
                        ...cellBorderStyle, textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}
                >
                  {formatCellValue(metricTotals.colTotals[ci] ?? 0)}
                </td>
              ))}
              <td style={{ ...cellBorderStyle, textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                {formatCellValue(metricTotals.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AnalysisSection>
  );
}
