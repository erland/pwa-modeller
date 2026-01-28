import { useMemo } from 'react';

import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import type { MatrixMetricId } from '../../../domain/analysis/metrics';

export type MatrixTableDerived = {
  maxCellCount: number;
  baseValues: number[][] | undefined;
  displayRows: RelationshipMatrixResult['rows'];
  displayCols: RelationshipMatrixResult['cols'];
  displayCells: RelationshipMatrixResult['cells'];
  displayValues: number[][] | undefined;
  metricTotals: { rowTotals: number[]; colTotals: number[]; grandTotal: number };
  heatmapMaxValue: number;
};

export function useMatrixTableDerived(args: {
  result: RelationshipMatrixResult;
  cellMetricId: 'off' | MatrixMetricId;
  cellValues?: number[][];
  hideEmpty: boolean;
  heatmapEnabled: boolean;
}): MatrixTableDerived {
  const { result, cellMetricId, cellValues, hideEmpty, heatmapEnabled } = args;
  const { rows, cols, cells, rowTotals, colTotals } = result;

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
        displayColTotals: colTotals,
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
      return { rowTotals: displayRowTotals, colTotals: displayColTotals, grandTotal: gt };
    }

    const rowTotals2 = displayValues.map((row) => row.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0));
    const colTotals2 = displayCols.map((_, ci) =>
      displayValues.reduce((sum, row) => sum + (Number.isFinite(row[ci]) ? row[ci] : 0), 0)
    );
    const grandTotal2 = rowTotals2.reduce((a, b) => a + b, 0);
    return { rowTotals: rowTotals2, colTotals: colTotals2, grandTotal: grandTotal2 };
  }, [displayCols, displayColTotals, displayRowTotals, displayValues]);

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

  return {
    maxCellCount,
    baseValues,
    displayRows,
    displayCols,
    displayCells,
    displayValues,
    metricTotals,
    heatmapMaxValue,
  };
}
