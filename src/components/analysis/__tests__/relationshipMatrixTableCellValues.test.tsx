import React from 'react';
import { render, screen } from '@testing-library/react';

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
      />
    );

    const cellButton = screen.getByLabelText('Open cell details for Row A → Col B');
    expect(cellButton.textContent).toBe('2');
  });
});
