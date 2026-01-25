import type { RelationshipType } from '../../types';
import type { AnalysisDirection } from '../filters';
import type { RelationshipMatrixFilters, RelationshipMatrixOptions } from '../relationshipMatrix';

export type MetricTarget = 'node' | 'edge' | 'matrixCell';

/**
 * Built-in metric identifiers.
 *
 * Keep these stable since they may be persisted in local storage.
 */
export type NodeMetricId = 'nodeDegree' | 'nodeReach' | 'nodePropertyNumber';
export type MatrixMetricId = 'matrixRelationshipCount' | 'matrixWeightedCount';
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


export type NodePropertyNumberMetricParams = {
  /** Property key. Supports "ns:key" (tagged value), or plain "key". */
  key: string;
  /** Optional subset of nodes to compute the metric for. If omitted, computes for all nodes. */
  nodeIds?: string[];
  /**
   * Resolver for a node's numeric value.
   *
   * This is intentionally injected so the metrics layer stays notation-agnostic,
   * while callers decide how to map nodeIds to element/relationship metadata.
   */
  getValueByNodeId: (nodeId: string, key: string) => number | undefined;
};

export type MatrixRelationshipCountMetricParams = {
  rowIds: string[];
  colIds: string[];
  filters?: RelationshipMatrixFilters;
  options?: RelationshipMatrixOptions;
};

export type MatrixWeightedCountMetricParams = {
  rowIds: string[];
  colIds: string[];
  filters?: RelationshipMatrixFilters;
  options?: RelationshipMatrixOptions;
  /** Weight per relationship type. Types not present default to defaultWeight. */
  weightsByRelationshipType: Record<string, number>;
  /** Default weight when a type isn't included in weightsByRelationshipType. Defaults to 1. */
  defaultWeight?: number;
};

export type MetricParamsById = {
  nodeDegree: NodeDegreeMetricParams;
  nodeReach: NodeReachMetricParams;
  nodePropertyNumber: NodePropertyNumberMetricParams;
  matrixRelationshipCount: MatrixRelationshipCountMetricParams;
  matrixWeightedCount: MatrixWeightedCountMetricParams;
};

export type NodeMetricResult = Record<string, number>;

export type MatrixMetricResult = {
  rowIds: string[];
  colIds: string[];
  /** values[rowIndex][colIndex] */
  values: number[][];
};
