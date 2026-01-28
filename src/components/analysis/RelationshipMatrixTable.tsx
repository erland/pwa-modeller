import { useEffect } from 'react';
import type { CSSProperties } from 'react';

import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';
import type { MatrixMetricId } from '../../domain/analysis/metrics';
import { AnalysisSection } from './layout/AnalysisSection';

import { formatCellValue, formatTotal } from './matrixTable/matrixTableFormat';
import { useMatrixTableDerived } from './matrixTable/useMatrixTableDerived';
import { MatrixTableActions } from './matrixTable/MatrixTableActions';
import { MatrixTableGrid } from './matrixTable/MatrixTableGrid';

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
  const { rows, cols, grandTotal } = result;

  // If cell values are disabled, heatmap shading doesn't make sense.
  useEffect(() => {
    if (cellMetricId === 'off' && heatmapEnabled) onChangeHeatmapEnabled(false);
  }, [cellMetricId, heatmapEnabled, onChangeHeatmapEnabled]);

  const {
    maxCellCount,
    baseValues,
    displayRows,
    displayCols,
    displayCells,
    displayValues,
    metricTotals,
    heatmapMaxValue,
  } = useMatrixTableDerived({
    result,
    cellMetricId,
    cellValues,
    hideEmpty,
    heatmapEnabled,
  });

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
    <MatrixTableActions
      modelName={modelName}
      result={result}
      baseValues={baseValues}
      cellMetricId={cellMetricId}
      onChangeCellMetricId={onChangeCellMetricId}
      weightsByRelationshipType={weightsByRelationshipType}
      onChangeRelationshipTypeWeight={onChangeRelationshipTypeWeight}
      weightPresets={weightPresets}
      weightPresetId={weightPresetId}
      onChangeWeightPresetId={onChangeWeightPresetId}
      relationshipTypesForWeights={relationshipTypesForWeights}
      heatmapEnabled={heatmapEnabled}
      onChangeHeatmapEnabled={onChangeHeatmapEnabled}
      heatmapMaxValue={heatmapMaxValue}
      highlightMissing={highlightMissing}
      onToggleHighlightMissing={onToggleHighlightMissing}
      hideEmpty={hideEmpty}
      onChangeHideEmpty={onChangeHideEmpty}
    />
  );

  return (
    <AnalysisSection title="Results" hint={hint} actions={actions}>
      <MatrixTableGrid
        cellBorderStyle={cellBorderStyle}
        cellMetricId={cellMetricId}
        displayRows={displayRows}
        displayCols={displayCols}
        displayCells={displayCells}
        displayValues={displayValues}
        metricTotals={metricTotals}
        heatmapEnabled={heatmapEnabled}
        heatmapMaxValue={heatmapMaxValue}
        highlightMissing={highlightMissing}
        onOpenCell={onOpenCell}
      />
    </AnalysisSection>
  );
}
