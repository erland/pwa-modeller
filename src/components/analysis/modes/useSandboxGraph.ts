import { useMemo } from 'react';

import type { Model } from '../../../domain';
import type { Point } from '../../diagram/geometry';
import type { SandboxNode } from '../workspace/controller/sandboxTypes';
import type { SandboxRenderableRelationship } from './SandboxEdgesLayer';

import { buildAnalysisGraph } from '../../../domain';

import { SANDBOX_GRID_SIZE, SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';
import { computeSandboxOrthogonalPointsByRelationshipId } from './sandboxRouting';
import {
  buildNodeById,
  buildSandboxNodeById,
  buildSandboxRelationshipsModel,
  buildSandboxSubModel,
  getAllRelationshipTypes,
  getRelationshipTypesFromRendered,
} from './sandboxUtils';

/**
 * Performance-focused derived graph/model computations for Sandbox.
 *
 * This hook intentionally contains no JSX and no UI concerns beyond the
 * minimum needed to derive routing points and a relationships-inclusive model.
 */
export function useSandboxGraph({
  model,
  nodes,
  renderedRelationships,
  relationshipsShow,
  edgeRouting,
  nodeW = SANDBOX_NODE_W,
  nodeH = SANDBOX_NODE_H,
  gridSize = SANDBOX_GRID_SIZE,
}: {
  model: Model;
  nodes: SandboxNode[];
  renderedRelationships: SandboxRenderableRelationship[];
  relationshipsShow: boolean;
  edgeRouting: 'straight' | 'orthogonal' | string;
  nodeW?: number;
  nodeH?: number;
  gridSize?: number;
}) {
  const nodeById = useMemo(() => buildNodeById(nodes), [nodes]);
  const sandboxNodeById = useMemo(() => buildSandboxNodeById(nodes), [nodes]);

  const sandboxSubModel = useMemo(() => buildSandboxSubModel(model, nodes), [model, nodes]);

  const sandboxRelationshipsModel = useMemo(() => {
    return buildSandboxRelationshipsModel(model, sandboxSubModel, renderedRelationships);
  }, [model, renderedRelationships, sandboxSubModel]);

  const allRelationshipTypes = useMemo(() => getAllRelationshipTypes(model), [model]);

  const overlayRelationshipTypes = useMemo(() => getRelationshipTypesFromRendered(renderedRelationships), [renderedRelationships]);

  const orthogonalPointsByRelationshipId = useMemo(() => {
    if (edgeRouting !== 'orthogonal') return new Map<string, Point[]>();
    if (!relationshipsShow) return new Map<string, Point[]>();
    if (renderedRelationships.length === 0) return new Map<string, Point[]>();
    return computeSandboxOrthogonalPointsByRelationshipId({
      nodes,
      renderedRelationships,
      nodeW,
      nodeH,
      gridSize,
    });
  }, [edgeRouting, relationshipsShow, renderedRelationships, nodes, nodeW, nodeH, gridSize]);

  const analysisGraph = useMemo(() => buildAnalysisGraph(sandboxRelationshipsModel), [sandboxRelationshipsModel]);

  return {
    nodeById,
    sandboxNodeById,
    sandboxSubModel,
    sandboxRelationshipsModel,
    allRelationshipTypes,
    overlayRelationshipTypes,
    orthogonalPointsByRelationshipId,
    analysisGraph,
  };
}
