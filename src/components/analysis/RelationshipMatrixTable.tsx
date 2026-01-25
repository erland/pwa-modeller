import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import { exportRelationshipMatrixCsv, exportRelationshipMatrixMissingLinksCsv } from './exportRelationshipMatrixCsv';

export interface RelationshipMatrixTableProps {
  modelName: string;
  result: RelationshipMatrixResult;
  /** If true, visually highlight 0-count cells. */
  highlightMissing: boolean;
  onToggleHighlightMissing: () => void;

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

export function RelationshipMatrixTable({
  modelName,
  result,
  highlightMissing,
  onToggleHighlightMissing,
  onOpenCell
}: RelationshipMatrixTableProps) {
  const { rows, cols, cells, rowTotals, colTotals, grandTotal } = result;

  const [hideEmpty, setHideEmpty] = useState<boolean>(false);

  const maxCellCount = useMemo(() => {
    let max = 0;
    for (const row of cells) {
      for (const cell of row) {
        if (cell.count > max) max = cell.count;
      }
    }
    return max;
  }, [cells]);


  const { displayRows, displayCols, displayCells, displayRowTotals, displayColTotals } = useMemo(() => {
    if (!hideEmpty) {
      return {
        displayRows: rows,
        displayCols: cols,
        displayCells: cells,
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

    return { displayRows, displayCols, displayCells, displayRowTotals, displayColTotals };
  }, [cells, colTotals, cols, hideEmpty, rowTotals, rows]);

  const cellBorderStyle: CSSProperties = { border: '1px solid var(--diagram-grid-line)' };

  return (
    <div className="crudSection" style={{ marginTop: 14 }}>
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Relationship matrix</p>
          <p className="crudHint">
            Rows: <span className="mono">{rows.length}</span>, Columns: <span className="mono">{cols.length}</span>, Total
            links: <span className="mono">{formatTotal(grandTotal)}</span>
            {maxCellCount > 0 ? (
              <>
                , Max cell: <span className="mono">{formatTotal(maxCellCount)}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="crudActions" style={{ alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => exportRelationshipMatrixCsv(modelName, result)}
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
            <input type="checkbox" checked={hideEmpty} onChange={() => setHideEmpty((v) => !v)} />
            Hide empty rows/columns
          </label>
        </div>
      </div>

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
                {cols.map((c, ci) => {
                  const cell = displayCells[ri][ci];
                  const isMissing = cell.count === 0;
                  return (
                    <td
                      key={c.id}
                      style={{
                        ...cellBorderStyle,
                        textAlign: 'right',
                        padding: '8px 10px',
                        fontVariantNumeric: 'tabular-nums',
                        background: highlightMissing && isMissing ? 'rgba(255, 255, 255, 0.03)' : undefined,
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
                        {cell.count ? formatTotal(cell.count) : ''}
                      </button>
                    </td>
                  );
                })}
                <td style={{
                  ...cellBorderStyle, textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
                  {formatTotal(displayRowTotals[ri] ?? 0)}
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
                  {formatTotal(displayColTotals[ci] ?? 0)}
                </td>
              ))}
              <td style={{ ...cellBorderStyle, textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                {formatTotal(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
