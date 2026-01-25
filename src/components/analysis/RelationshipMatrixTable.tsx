import { useMemo } from 'react';

import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';

export interface RelationshipMatrixTableProps {
  result: RelationshipMatrixResult;
  /** If true, visually highlight 0-count cells. */
  highlightMissing: boolean;
  onToggleHighlightMissing: () => void;
}

function formatTotal(n: number): string {
  return String(n);
}

export function RelationshipMatrixTable({ result, highlightMissing, onToggleHighlightMissing }: RelationshipMatrixTableProps) {
  const { rows, cols, cells, rowTotals, colTotals, grandTotal } = result;

  const maxCellCount = useMemo(() => {
    let max = 0;
    for (const row of cells) {
      for (const cell of row) {
        if (cell.count > max) max = cell.count;
      }
    }
    return max;
  }, [cells]);

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
        <div className="crudActions" style={{ alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
            <input type="checkbox" checked={highlightMissing} onChange={onToggleHighlightMissing} />
            Highlight missing links (0)
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
        <table className="crudTable" style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
          <thead>
            <tr>
              <th
                style={{
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
              {cols.map((c) => (
                <th
                  key={c.id}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 3,
                    background: 'var(--surface-2)',
                    minWidth: 140,
                    maxWidth: 220,
                    whiteSpace: 'nowrap',
                  }}
                  title={c.label}
                >
                  {c.label}
                </th>
              ))}
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                  background: 'var(--surface-2)',
                  minWidth: 90,
                  textAlign: 'right',
                }}
                title="Row total"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.id}>
                <th
                  style={{
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
                  const cell = cells[ri][ci];
                  const isMissing = cell.count === 0;
                  return (
                    <td
                      key={c.id}
                      style={{
                        textAlign: 'right',
                        padding: '8px 10px',
                        fontVariantNumeric: 'tabular-nums',
                        background: highlightMissing && isMissing ? 'rgba(255, 255, 255, 0.03)' : undefined,
                        opacity: isMissing ? 0.7 : 1,
                      }}
                      title={cell.relationshipIds.length ? cell.relationshipIds.join('\n') : 'No links'}
                    >
                      {cell.count ? formatTotal(cell.count) : ''}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
                  {formatTotal(rowTotals[ri] ?? 0)}
                </td>
              </tr>
            ))}
            <tr>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: 'var(--surface-2)',
                  textAlign: 'left',
                }}
              >
                Total
              </th>
              {cols.map((c, ci) => (
                <td
                  key={c.id}
                  style={{ textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}
                >
                  {formatTotal(colTotals[ci] ?? 0)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                {formatTotal(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
