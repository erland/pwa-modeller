import type { Model, Relationship, RelationshipType } from '../types';
import { normalizeRelationshipTypeFilter, relationshipPassesTypeFilter } from './filters';

export type RelationshipMatrixDirection = 'rowToCol' | 'colToRow' | 'both';

export interface RelationshipMatrixFilters {
  /** Allowed relationship types. If omitted/empty, all relationship types are allowed. */
  relationshipTypes?: RelationshipType[];
  /** How to interpret direction when counting links in cells. Defaults to 'both'. */
  direction?: RelationshipMatrixDirection;
}

export interface RelationshipMatrixOptions {
  /** If false, relationships where rowId === colId will be ignored. Defaults to false. */
  includeSelf?: boolean;
}

export type RelationshipMatrixAxisItem = {
  id: string;
  label: string;
};

export type RelationshipMatrixCell = {
  /** Number of relationships that match this cell. */
  count: number;
  /** Matching relationship ids (order is deterministic based on model iteration). */
  relationshipIds: string[];
};

export type RelationshipMatrixResult = {
  rows: RelationshipMatrixAxisItem[];
  cols: RelationshipMatrixAxisItem[];
  /** cells[rowIndex][colIndex] */
  cells: RelationshipMatrixCell[][];
  rowTotals: number[];
  colTotals: number[];
  grandTotal: number;
};

function relationshipIsUndirected(r: Relationship): boolean {
  const attrs = r.attrs as unknown as { isDirected?: boolean } | undefined;
  return attrs?.isDirected === false;
}

function labelForElementId(model: Model, id: string): string {
  const el = model.elements[id];
  return el?.name || id;
}

function createEmptyCell(): RelationshipMatrixCell {
  return { count: 0, relationshipIds: [] };
}

function addToCell(cell: RelationshipMatrixCell, relationshipId: string): void {
  cell.relationshipIds.push(relationshipId);
  cell.count = cell.relationshipIds.length;
}

function shouldIncludePair(
  direction: RelationshipMatrixDirection,
  sourceIsRow: boolean,
  targetIsCol: boolean,
  sourceIsCol: boolean,
  targetIsRow: boolean
): boolean {
  if (direction === 'both') return (sourceIsRow && targetIsCol) || (sourceIsCol && targetIsRow);
  if (direction === 'rowToCol') return sourceIsRow && targetIsCol;
  // colToRow
  return sourceIsCol && targetIsRow;
}

/**
 * Build a relationship matrix between two element sets.
 *
 * - Rows and columns are provided as explicit element id arrays.
 * - Filters can restrict relationship types and direction.
 * - Undirected relationships (attrs.isDirected === false) are treated as bidirectional.
 */
export function buildRelationshipMatrix(
  model: Model,
  rowIds: string[],
  colIds: string[],
  filters: RelationshipMatrixFilters = {},
  options: RelationshipMatrixOptions = {}
): RelationshipMatrixResult {
  const direction: RelationshipMatrixDirection = filters.direction ?? 'both';
  const includeSelf = options.includeSelf ?? false;
  const typeSet = normalizeRelationshipTypeFilter(filters);

  const rows: RelationshipMatrixAxisItem[] = rowIds.map(id => ({ id, label: labelForElementId(model, id) }));
  const cols: RelationshipMatrixAxisItem[] = colIds.map(id => ({ id, label: labelForElementId(model, id) }));

  const rowIndex = new Map<string, number>();
  const colIndex = new Map<string, number>();
  rows.forEach((r, i) => rowIndex.set(r.id, i));
  cols.forEach((c, i) => colIndex.set(c.id, i));

  const cells: RelationshipMatrixCell[][] = rows.map(() => cols.map(() => createEmptyCell()));

  for (const r of Object.values(model.relationships)) {
    if (!relationshipPassesTypeFilter(r, typeSet)) continue;
    const a = r.sourceElementId;
    const b = r.targetElementId;
    if (!a || !b) continue;
    if (!includeSelf && a === b) continue;

    const undirected = relationshipIsUndirected(r);

    const aIsRow = rowIndex.has(a);
    const bIsCol = colIndex.has(b);
    const aIsCol = colIndex.has(a);
    const bIsRow = rowIndex.has(b);

    // Directed forward pair a -> b
    if (shouldIncludePair(direction, aIsRow, bIsCol, aIsCol, bIsRow)) {
      const ri = rowIndex.get(aIsRow ? a : b)!;
      const ci = colIndex.get(bIsCol ? b : a)!;
      addToCell(cells[ri][ci], r.id);
    }

    // If undirected, also allow the reverse pair b -> a (even if the stored direction is opposite).
    if (undirected) {
      const bIsRow2 = rowIndex.has(b);
      const aIsCol2 = colIndex.has(a);
      const bIsCol2 = colIndex.has(b);
      const aIsRow2 = rowIndex.has(a);

      if (shouldIncludePair(direction, bIsRow2, aIsCol2, bIsCol2, aIsRow2)) {
        const ri = rowIndex.get(bIsRow2 ? b : a)!;
        const ci = colIndex.get(aIsCol2 ? a : b)!;
        addToCell(cells[ri][ci], r.id);
      }
    }
  }

  const rowTotals = rows.map((_, ri) => cells[ri].reduce((sum, cell) => sum + cell.count, 0));
  const colTotals = cols.map((_, ci) => cells.reduce((sum, row) => sum + row[ci].count, 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  return { rows, cols, cells, rowTotals, colTotals, grandTotal };
}
