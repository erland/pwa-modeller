import type { CSSProperties } from 'react';

import type { MatrixMetricId } from '../../../domain/analysis/metrics';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import { formatCellValue } from './matrixTableFormat';

export function MatrixTableGrid(props: {
  cellBorderStyle: CSSProperties;
  cellMetricId: 'off' | MatrixMetricId;

  displayRows: RelationshipMatrixResult['rows'];
  displayCols: RelationshipMatrixResult['cols'];
  displayCells: RelationshipMatrixResult['cells'];
  displayValues: number[][] | undefined;

  metricTotals: { rowTotals: number[]; colTotals: number[]; grandTotal: number };

  heatmapEnabled: boolean;
  heatmapMaxValue: number;
  highlightMissing: boolean;

  onOpenCell?: (args: {
    rowId: string;
    rowLabel: string;
    colId: string;
    colLabel: string;
    relationshipIds: string[];
  }) => void;
}) {
  const {
    cellBorderStyle,
    cellMetricId,
    displayRows,
    displayCols,
    displayCells,
    displayValues,
    metricTotals,
    heatmapEnabled,
    heatmapMaxValue,
    highlightMissing,
    onOpenCell,
  } = props;

  return (
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
                const valueText = cellMetricId === 'off' ? '' : rawValue ? formatCellValue(rawValue) : '';

                const heatIntensity =
                  heatmapEnabled && cellMetricId !== 'off' && heatmapMaxValue > 0
                    ? Math.max(0, Math.min(1, rawValue / heatmapMaxValue))
                    : 0;
                const heatAlpha = heatIntensity > 0 ? 0.18 * heatIntensity : 0;
                const heatmapBg = heatAlpha > 0 ? `rgba(var(--analysis-heatmap-fill-rgb), ${heatAlpha})` : undefined;

                return (
                  <td
                    key={c.id}
                    data-heat={heatIntensity > 0 ? heatIntensity.toFixed(3) : undefined}
                    style={{
                      ...cellBorderStyle,
                      textAlign: 'right',
                      padding: '8px 10px',
                      fontVariantNumeric: 'tabular-nums',
                      background: heatmapBg ?? (highlightMissing && isMissing ? 'var(--analysis-matrix-missing-bg)' : undefined),
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
              <td
                style={{
                  ...cellBorderStyle,
                  textAlign: 'right',
                  padding: '8px 10px',
                  fontVariantNumeric: 'tabular-nums',
                  opacity: 0.9,
                }}
              >
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
                  ...cellBorderStyle,
                  textAlign: 'right',
                  padding: '8px 10px',
                  fontVariantNumeric: 'tabular-nums',
                  opacity: 0.9,
                }}
              >
                {formatCellValue(metricTotals.colTotals[ci] ?? 0)}
              </td>
            ))}
            <td
              style={{
                ...cellBorderStyle,
                textAlign: 'right',
                padding: '8px 10px',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
              }}
            >
              {formatCellValue(metricTotals.grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
