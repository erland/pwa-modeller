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
  MatrixRelationshipCountMetricParams,
  MatrixWeightedCountMetricParams
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

function computeWeightedCount(model: Model, params: MatrixWeightedCountMetricParams): MatrixMetricResult {
  const filters: RelationshipMatrixFilters = params.filters ?? {};
  const options: RelationshipMatrixOptions = params.options ?? {};
  const defaultWeight = params.defaultWeight ?? 1;
  const weights = params.weightsByRelationshipType;

  const res = buildRelationshipMatrix(model, params.rowIds, params.colIds, filters, options);

  const values = res.cells.map((row) =>
    row.map((cell) => {
      if (!cell.relationshipIds.length) return 0;
      let sum = 0;
      for (const relId of cell.relationshipIds) {
        const rel = model.relationships[relId];
        if (!rel) continue;
        const w = weights[String(rel.type)];
        sum += Number.isFinite(w) ? w : defaultWeight;
      }
      return sum;
    })
  );

  return {
    rowIds: res.rows.map((r) => r.id),
    colIds: res.cols.map((c) => c.id),
    values,
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
    case 'matrixWeightedCount':
      return computeWeightedCount(model, params as MatrixWeightedCountMetricParams);
    default: {
      const exhaustiveCheck: never = metricId;
      throw new Error(`Unsupported matrix metric: ${exhaustiveCheck}`);
    }
  }
}
