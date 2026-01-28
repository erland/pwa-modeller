import { useMemo } from 'react';

import type { MatrixMetricId, Model } from '../../../../domain';
import { computeMatrixMetric } from '../../../../domain';
import { buildRelationshipMatrix } from '../../../../domain/analysis/relationshipMatrix';
import type { MatrixWorkspaceBuiltQuery } from './types';

export function useMatrixComputation(args: {
  model: Model | null;
  builtQuery: MatrixWorkspaceBuiltQuery | null;
  cellMetricId: 'off' | MatrixMetricId;
  weightsByRelationshipType: Record<string, number>;
}) {
  const { model, builtQuery, cellMetricId, weightsByRelationshipType } = args;

  const result = useMemo(() => {
    if (!model || !builtQuery) return null;
    return buildRelationshipMatrix(
      model,
      builtQuery.rowIds,
      builtQuery.colIds,
      { relationshipTypes: builtQuery.relationshipTypes, direction: builtQuery.direction },
      { includeSelf: false }
    );
  }, [builtQuery, model]);

  const cellValues = useMemo(() => {
    if (!model || !builtQuery) return undefined;
    if (cellMetricId === 'off') return undefined;

    const baseParams = {
      rowIds: builtQuery.rowIds,
      colIds: builtQuery.colIds,
      filters: {
        direction: builtQuery.direction,
        relationshipTypes: builtQuery.relationshipTypes.length ? builtQuery.relationshipTypes : undefined,
      },
      options: { includeSelf: false },
    } as const;

    if (cellMetricId === 'matrixWeightedCount') {
      return computeMatrixMetric(model, 'matrixWeightedCount', {
        ...baseParams,
        weightsByRelationshipType,
        defaultWeight: 1,
      }).values;
    }

    return computeMatrixMetric(model, cellMetricId, baseParams).values;
  }, [builtQuery, cellMetricId, model, weightsByRelationshipType]);

  const relationshipTypesForWeights = useMemo(() => {
    if (!model || !result) return [] as string[];
    const found = new Set<string>();
    for (const row of result.cells) {
      for (const cell of row) {
        for (const id of cell.relationshipIds) {
          const rel = model.relationships[id];
          if (!rel) continue;
          found.add(String(rel.type));
        }
      }
    }
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [model, result]);

  return { result, cellValues, relationshipTypesForWeights };
}
