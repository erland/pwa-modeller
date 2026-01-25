import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';

import { RelationshipMatrixTable } from '../RelationshipMatrixTable';

describe('RelationshipMatrixTable cell metric rendering', () => {
  test('renders numeric cell value for relationship count metric', () => {
    const result: RelationshipMatrixResult = {
      rows: [{ id: 'row1', label: 'Row A' }],
      cols: [{ id: 'col1', label: 'Col B' }],
      cells: [[{ count: 2, relationshipIds: ['r1', 'r2'] }]],
      rowTotals: [2],
      colTotals: [2],
      grandTotal: 2,
    };

    render(
      <RelationshipMatrixTable
        modelName="model"
        result={result}
        cellMetricId="matrixRelationshipCount"
        onChangeCellMetricId={() => {}}
        cellValues={[[2]]}
        highlightMissing={false}
        onToggleHighlightMissing={() => {}}
        heatmapEnabled={false}
        onChangeHeatmapEnabled={() => {}}
        hideEmpty={false}
        onChangeHideEmpty={() => {}}
      />
    );

    const cellButton = screen.getByLabelText('Open cell details for Row A → Col B');
    expect(cellButton.textContent).toBe('2');
  });

  test('applies heatmap intensity attribute based on relative cell values', () => {
    const result: RelationshipMatrixResult = {
      rows: [{ id: 'row1', label: 'Row A' }],
      cols: [
        { id: 'col1', label: 'Col B' },
        { id: 'col2', label: 'Col C' },
      ],
      cells: [[
        { count: 1, relationshipIds: ['r1'] },
        { count: 2, relationshipIds: ['r2', 'r3'] },
      ]],
      rowTotals: [3],
      colTotals: [1, 2],
      grandTotal: 3,
    };

    function Harness() {
      const [heatmapEnabled, setHeatmapEnabled] = useState(false);
      return (
        <RelationshipMatrixTable
          modelName="model"
          result={result}
          cellMetricId="matrixRelationshipCount"
          onChangeCellMetricId={() => {}}
          cellValues={[[1, 2]]}
          highlightMissing={false}
          onToggleHighlightMissing={() => {}}
          heatmapEnabled={heatmapEnabled}
          onChangeHeatmapEnabled={setHeatmapEnabled}
          hideEmpty={false}
          onChangeHideEmpty={() => {}}
        />
      );
    }

    render(<Harness />);

    // Enable heatmap shading
    const heatmapToggle = screen.getByLabelText('Heatmap shading');
    fireEvent.click(heatmapToggle);

    const cellB = screen.getByLabelText('Open cell details for Row A → Col B');
    const cellC = screen.getByLabelText('Open cell details for Row A → Col C');

    const tdB = cellB.closest('td');
    const tdC = cellC.closest('td');
    expect(tdB).toBeTruthy();
    expect(tdC).toBeTruthy();

    const heatB = Number(tdB!.getAttribute('data-heat'));
    const heatC = Number(tdC!.getAttribute('data-heat'));
    expect(heatC).toBeGreaterThan(heatB);
  });
});
