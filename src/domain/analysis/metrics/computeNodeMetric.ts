import type { RelationshipType } from '../../types';
import type { AnalysisGraph } from '../graph';
import { getTraversalSteps } from '../traverse';
import type {
  NodeMetricId,
  MetricParamsById,
  NodeMetricResult,
  NodeDegreeMetricParams
} from './types';

function normalizeRelationshipTypes(types?: RelationshipType[]): ReadonlySet<RelationshipType> | undefined {
  if (!types || types.length === 0) return undefined;
  return new Set(types);
}

function computeNodeDegree(graph: AnalysisGraph, params: NodeDegreeMetricParams): NodeMetricResult {
  const allowed = normalizeRelationshipTypes(params.relationshipTypes);
  const out: NodeMetricResult = {};

  for (const nodeId of graph.nodes.keys()) {
    const steps = getTraversalSteps(graph, nodeId, params.direction, allowed);
    out[nodeId] = steps.length;
  }

  return out;
}

/**
 * Compute a node-targeted metric for all nodes in the graph.
 */
export function computeNodeMetric(
  graph: AnalysisGraph,
  metricId: NodeMetricId,
  params: MetricParamsById[NodeMetricId]
): NodeMetricResult {
  switch (metricId) {
    case 'nodeDegree':
      return computeNodeDegree(graph, params as NodeDegreeMetricParams);
    default: {
      // Compile-time should prevent unsupported ids, but keep runtime guard.
      const exhaustiveCheck: never = metricId;
      throw new Error(`Unsupported node metric: ${exhaustiveCheck}`);
    }
  }
}
