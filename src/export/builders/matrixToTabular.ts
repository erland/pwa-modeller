import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import type { TabularData } from '../contracts/ExportBundle';

export function buildMatrixTabular(result: RelationshipMatrixResult, values?: number[][]): TabularData {
  const { rows, cols, cells } = result;

  const effectiveValues: number[][] = values && values.length
    ? values
    : cells.map((row) => row.map((c) => c.count));

  const rowTotals = effectiveValues.map((row) => row.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0));
  const colTotals = cols.map((_, ci) => effectiveValues.reduce((sum, row) => sum + (Number.isFinite(row[ci]) ? row[ci] : 0), 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  const headers = ['Row \\ Col', ...cols.map((c) => c.label), 'Total'];

  const outRows: Array<Array<string | number | null>> = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const row: Array<string | number | null> = [r.label];
    for (let ci = 0; ci < cols.length; ci++) {
      const v = effectiveValues[ri]?.[ci] ?? 0;
      row.push(v ? v : null);
    }
    row.push(rowTotals[ri] ?? 0);
    outRows.push(row);
  }
  outRows.push(['Total', ...cols.map((_, ci) => colTotals[ci] ?? 0), grandTotal]);

  return { headers, rows: outRows };
}
