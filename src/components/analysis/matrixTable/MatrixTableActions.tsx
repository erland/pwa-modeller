import type { MatrixMetricId } from '../../../domain/analysis/metrics';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import { exportRelationshipMatrixCsv, exportRelationshipMatrixMissingLinksCsv } from '../exportRelationshipMatrixCsv';
import { formatCellValue } from './matrixTableFormat';

export function MatrixTableActions(props: {
  modelName: string;
  result: RelationshipMatrixResult;
  baseValues: number[][] | undefined;

  cellMetricId: 'off' | MatrixMetricId;
  onChangeCellMetricId: (v: 'off' | MatrixMetricId) => void;

  weightsByRelationshipType?: Record<string, number>;
  onChangeRelationshipTypeWeight?: (relationshipType: string, weight: number) => void;
  weightPresets?: Array<{ id: string; label: string }>;
  weightPresetId?: string;
  onChangeWeightPresetId?: (presetId: string) => void;
  relationshipTypesForWeights?: string[];

  heatmapEnabled: boolean;
  onChangeHeatmapEnabled: (v: boolean) => void;
  heatmapMaxValue: number;

  highlightMissing: boolean;
  onToggleHighlightMissing: () => void;

  hideEmpty: boolean;
  onChangeHideEmpty: (v: boolean) => void;
}) {
  const {
    modelName,
    result,
    baseValues,
    cellMetricId,
    onChangeCellMetricId,
    weightsByRelationshipType,
    onChangeRelationshipTypeWeight,
    weightPresets,
    weightPresetId,
    onChangeWeightPresetId,
    relationshipTypesForWeights,
    heatmapEnabled,
    onChangeHeatmapEnabled,
    heatmapMaxValue,
    highlightMissing,
    onToggleHighlightMissing,
    hideEmpty,
    onChangeHideEmpty,
  } = props;

  return (
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
                          onChange={(e) => onChangeRelationshipTypeWeight?.(t, Number.parseFloat(e.currentTarget.value))}
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
}
