import type { Model } from '../../types';
import {
  buildRelationshipMatrix,
  type RelationshipMatrixFilters,
  type RelationshipMatrixOptions
} from '../relationshipMatrix';
import type {
  MatrixMetricId,
  MetricParamsById,
  MatrixMetricResult,
  MatrixRelationshipCountMetricParams
} from './types';

function computeRelationshipCount(model: Model, params: MatrixRelationshipCountMetricParams): MatrixMetricResult {
  const filters: RelationshipMatrixFilters = params.filters ?? {};
  const options: RelationshipMatrixOptions = params.options ?? {};

  const res = buildRelationshipMatrix(model, params.rowIds, params.colIds, filters, options);

  return {
    rowIds: res.rows.map(r => r.id),
    colIds: res.cols.map(c => c.id),
    values: res.cells.map(row => row.map(cell => cell.count))
  };
}

/**
 * Compute a matrix-cell-targeted metric for the provided row/col ids.
 */
export function computeMatrixMetric(
  model: Model,
  metricId: MatrixMetricId,
  params: MetricParamsById[MatrixMetricId]
): MatrixMetricResult {
  switch (metricId) {
    case 'matrixRelationshipCount':
      return computeRelationshipCount(model, params as MatrixRelationshipCountMetricParams);
    default: {
      const exhaustiveCheck: never = metricId;
      throw new Error(`Unsupported matrix metric: ${exhaustiveCheck}`);
    }
  }
}
