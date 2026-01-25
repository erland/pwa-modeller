import type { RelationshipType } from '../../types';
import type { AnalysisDirection } from '../filters';
import type { RelationshipMatrixFilters, RelationshipMatrixOptions } from '../relationshipMatrix';

export type MetricTarget = 'node' | 'edge' | 'matrixCell';

/**
 * Built-in metric identifiers.
 *
 * Keep these stable since they may be persisted in local storage.
 */
export type NodeMetricId = 'nodeDegree' | 'nodeReach';
export type MatrixMetricId = 'matrixRelationshipCount';
export type BuiltInMetricId = NodeMetricId | MatrixMetricId;

/** Any metric id supported by the domain layer. */
export type MetricId = BuiltInMetricId;

export interface MetricDefinition {
  id: MetricId;
  label: string;
  target: MetricTarget;
  description?: string;
}

export type NodeDegreeMetricParams = {
  direction: AnalysisDirection;
  relationshipTypes?: RelationshipType[];
  /** Optional subset of nodes to compute the metric for. If omitted, computes for all nodes. */
  nodeIds?: string[];
};

export type NodeReachMetricParams = {
  direction: AnalysisDirection;
  maxDepth: number;
  relationshipTypes?: RelationshipType[];
  /** Optional subset of nodes to compute the metric for. If omitted, computes for all nodes. */
  nodeIds?: string[];
  /** Safety cap for the amount of visited nodes per start node. */
  maxVisited?: number;
};

export type MatrixRelationshipCountMetricParams = {
  rowIds: string[];
  colIds: string[];
  filters?: RelationshipMatrixFilters;
  options?: RelationshipMatrixOptions;
};

export type MetricParamsById = {
  nodeDegree: NodeDegreeMetricParams;
  nodeReach: NodeReachMetricParams;
  matrixRelationshipCount: MatrixRelationshipCountMetricParams;
};

export type NodeMetricResult = Record<string, number>;

export type MatrixMetricResult = {
  rowIds: string[];
  colIds: string[];
  /** values[rowIndex][colIndex] */
  values: number[][];
};
