import type { RelationshipType } from '../../types';
import type { AnalysisGraph } from '../graph';
import { getTraversalSteps } from '../traverse';
import type {
  NodeMetricId,
  MetricParamsById,
  NodeMetricResult,
  NodeDegreeMetricParams,
  NodeReachMetricParams
} from './types';

function normalizeRelationshipTypes(types?: RelationshipType[]): ReadonlySet<RelationshipType> | undefined {
  if (!types || types.length === 0) return undefined;
  return new Set(types);
}

function computeNodeDegree(graph: AnalysisGraph, params: NodeDegreeMetricParams): NodeMetricResult {
  const allowed = normalizeRelationshipTypes(params.relationshipTypes);
  const out: NodeMetricResult = {};

  const nodeIds = params.nodeIds && params.nodeIds.length ? params.nodeIds : Array.from(graph.nodes.keys());
  for (const nodeId of nodeIds) {
    if (!graph.nodes.has(nodeId)) continue;
    const steps = getTraversalSteps(graph, nodeId, params.direction, allowed);
    out[nodeId] = steps.length;
  }

  return out;
}

function computeNodeReach(graph: AnalysisGraph, params: NodeReachMetricParams): NodeMetricResult {
  const allowed = normalizeRelationshipTypes(params.relationshipTypes);
  const out: NodeMetricResult = {};

  const maxDepth = Math.max(0, Math.floor(params.maxDepth));
  const maxVisited = Math.max(10, Math.floor(params.maxVisited ?? 5000));

  const nodeIds = params.nodeIds && params.nodeIds.length ? params.nodeIds : Array.from(graph.nodes.keys());

  const reachFrom = (start: string): number => {
    // BFS frontier traversal, counting distinct nodes (excluding start) discovered within maxDepth.
    const visited = new Set<string>();
    visited.add(start);

    let frontier: string[] = [start];
    let depth = 0;
    let count = 0;

    while (frontier.length && depth < maxDepth) {
      const next: string[] = [];
      for (const id of frontier) {
        const steps = getTraversalSteps(graph, id, params.direction, allowed);
        for (const s of steps) {
          const to = s.toId;
          if (visited.has(to)) continue;
          visited.add(to);
          next.push(to);
          count += 1;
          if (visited.size >= maxVisited) return count;
        }
      }
      frontier = next;
      depth += 1;
    }
    return count;
  };

  for (const nodeId of nodeIds) {
    if (!graph.nodes.has(nodeId)) continue;
    out[nodeId] = reachFrom(nodeId);
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
    case 'nodeReach':
      return computeNodeReach(graph, params as NodeReachMetricParams);
    default: {
      // Compile-time should prevent unsupported ids, but keep runtime guard.
      const exhaustiveCheck: never = metricId;
      throw new Error(`Unsupported node metric: ${exhaustiveCheck}`);
    }
  }
}
