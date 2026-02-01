import type { RelationshipMatrixResult } from '../../domain/analysis/relationshipMatrix';

// Mock store exports used by the export module.
jest.mock('../../store', () => {
  const actual = jest.requireActual('../../store');
  return {
    ...actual,
    downloadTextFile: jest.fn()
  };
});

import { downloadTextFile } from '../../store';
import { exportRelationshipMatrixCsv, exportRelationshipMatrixMissingLinksCsv } from './exportRelationshipMatrixCsv';

function matrixResultFixture(): RelationshipMatrixResult {
  return {
    rows: [
      { id: 'r1', label: 'Row,1' },
      { id: 'r2', label: 'Row2' }
    ],
    cols: [
      { id: 'c1', label: 'Col,1' },
      { id: 'c2', label: 'Col"2' }
    ],
    cells: [
      [
        { count: 1, relationshipIds: ['a'] },
        { count: 0, relationshipIds: [] }
      ],
      [
        { count: 2, relationshipIds: ['b', 'c'] },
        { count: 3, relationshipIds: ['d', 'e', 'f'] }
      ]
    ],
    rowTotals: [1, 5],
    colTotals: [3, 3],
    grandTotal: 6
  };
}

describe('exportRelationshipMatrixCsv', () => {
  beforeEach(() => {
    (downloadTextFile as jest.Mock).mockClear();
  });

  it('exports a CSV with RFC4180-ish escaping, row/col totals and grand total', () => {
    exportRelationshipMatrixCsv('My Model', matrixResultFixture());

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [fileName, contents, mime] = (downloadTextFile as jest.Mock).mock.calls[0];

    expect(String(fileName)).toMatch(/my-model-relationship-matrix\.csv$/i);
    expect(mime).toBe('text/csv');

    const lines = String(contents).split('\n');
    expect(lines[0]).toBe('Row \\ Col,"Col,1","Col""2",Total');
    expect(lines[1]).toBe('"Row,1",1,,1');
    expect(lines[2]).toBe('Row2,2,3,5');
    expect(lines[3]).toBe('Total,3,3,6');
  });

  it('can export using explicit values override (used for metrics overlays)', () => {
    const values = [
      [0, 5],
      [0, 0]
    ];

    exportRelationshipMatrixCsv('M', matrixResultFixture(), values);

    const [, contents] = (downloadTextFile as jest.Mock).mock.calls[0];
    const lines = String(contents).split('\n');
    // Row 1: 0 becomes empty cell; 5 is kept.
    expect(lines[1]).toBe('"Row,1",,5,5');
    // Row 2 is all zeros -> empty cells but total still present.
    expect(lines[2]).toBe('Row2,,,0');
    // Totals
    expect(lines[3]).toBe('Total,0,5,5');
  });
});

describe('exportRelationshipMatrixMissingLinksCsv', () => {
  beforeEach(() => {
    (downloadTextFile as jest.Mock).mockClear();
  });

  it('exports missing links excluding self-pairs by default', () => {
    const r: RelationshipMatrixResult = {
      rows: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' }
      ],
      cols: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' }
      ],
      cells: [
        [
          { count: 0, relationshipIds: [] },
          { count: 1, relationshipIds: ['x'] }
        ],
        [
          { count: 0, relationshipIds: [] },
          { count: 0, relationshipIds: [] }
        ]
      ],
      rowTotals: [1, 0],
      colTotals: [0, 1],
      grandTotal: 1
    };

    exportRelationshipMatrixMissingLinksCsv('Model', r);
    const [, contents] = (downloadTextFile as jest.Mock).mock.calls[0];

    const lines = String(contents).split('\n');
    expect(lines[0]).toBe('rowId,rowName,colId,colName');

    // Missing links are: b->a and (b->b is excluded by default)
    expect(lines).toContain('b,B,a,A');
    expect(lines).not.toContain('a,A,a,A');
    expect(lines).not.toContain('b,B,b,B');
  });

  it('can include self-pairs when excludeSelf is false', () => {
    const r: RelationshipMatrixResult = {
      rows: [{ id: 'a', label: 'A' }],
      cols: [{ id: 'a', label: 'A' }],
      cells: [[{ count: 0, relationshipIds: [] }]],
      rowTotals: [0],
      colTotals: [0],
      grandTotal: 0
    };

    exportRelationshipMatrixMissingLinksCsv('Model', r, { excludeSelf: false });
    const [, contents] = (downloadTextFile as jest.Mock).mock.calls[0];

    expect(String(contents).trim().split('\n')).toEqual(['rowId,rowName,colId,colName', 'a,A,a,A']);
  });
});
