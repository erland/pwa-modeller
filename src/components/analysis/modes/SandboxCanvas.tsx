import type { DragEvent, MouseEvent, PointerEvent, RefObject } from 'react';

import type { Model } from '../../../domain';
import { RelationshipMarkers } from '../../diagram/RelationshipMarkers';
import type { Point } from '../../diagram/geometry';
import type { Selection } from '../../model/selection';

import type { SandboxNode } from '../workspace/controller/sandboxTypes';

import type { SandboxRenderableRelationship } from './SandboxEdgesLayer';
import { SandboxEdgesLayer } from './SandboxEdgesLayer';
import { SandboxNodesLayer } from './SandboxNodesLayer';

export function SandboxCanvas({
  svgRef,
  viewBox,
  isDropTarget,
  nodes,
  model,
  selectedElementId,
  pairAnchors,
  selection,
  nodeById,
  renderedRelationships,
  edgeRouting,
  orthogonalPointsByRelationshipId,
  selectedEdgeId,
  overlayBadgeByElementId,
  overlayScaleByElementId,
  onPointerDownCanvas,
  onPointerMove,
  onPointerUpOrCancel,
  onDragOver,
  onDragLeave,
  onDrop,
  onCanvasClick,
  onEdgeHitClick,
  onPointerDownNode,
  onClickNode,
  onDoubleClickNode,
}: {
  svgRef: RefObject<SVGSVGElement>;
  viewBox: string | null;
  isDropTarget: boolean;
  nodes: SandboxNode[];
  model: Model;
  selectedElementId: string | null;
  pairAnchors: string[];
  selection: Selection;
  nodeById: Map<string, { x: number; y: number }>;
  renderedRelationships: SandboxRenderableRelationship[];
  edgeRouting: 'straight' | 'orthogonal';
  orthogonalPointsByRelationshipId: Map<string, Point[]>;
  selectedEdgeId: string | null;
  overlayBadgeByElementId: Record<string, string> | null;
  overlayScaleByElementId: Record<string, number> | null;
  onPointerDownCanvas: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUpOrCancel: (e: PointerEvent<SVGSVGElement>) => void;
  onDragOver: (e: DragEvent<SVGSVGElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<SVGSVGElement>) => void;
  onCanvasClick: (e: MouseEvent<SVGSVGElement>) => void;
  onEdgeHitClick: (e: MouseEvent<SVGPathElement>, relationshipId: string) => void;
  onPointerDownNode: (e: PointerEvent<SVGGElement>, elementId: string) => void;
  onClickNode: (e: MouseEvent<SVGGElement>, elementId: string) => void;
  onDoubleClickNode: (elementId: string) => void;
}) {
  return (
    <div className="analysisSandboxRoot" aria-label="Analysis sandbox">
      <svg
        ref={svgRef}
        className={`analysisSandboxSvg ${isDropTarget ? 'isDropTarget' : ''}`}
        viewBox={viewBox ?? undefined}
        preserveAspectRatio={viewBox ? 'xMinYMin meet' : undefined}
        onPointerDown={onPointerDownCanvas}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onCanvasClick}
        role="img"
        aria-label="Sandbox canvas"
      >
        <RelationshipMarkers />
        {!nodes.length ? (
          <g className="analysisSandboxEmpty">
            <text x="50%" y="45%" textAnchor="middle">
              Drop elements here
            </text>
            <text x="50%" y="55%" textAnchor="middle">
              Tip: you can also select an element and press “Add selected”
            </text>
          </g>
        ) : null}

        <SandboxEdgesLayer
          renderedRelationships={renderedRelationships}
          nodeById={nodeById}
          edgeRouting={edgeRouting}
          orthogonalPointsByRelationshipId={orthogonalPointsByRelationshipId}
          selectedEdgeId={selectedEdgeId}
          isRelationshipSelected={(relationshipId) => selection.kind === 'relationship' && selection.relationshipId === relationshipId}
          onEdgeHitClick={onEdgeHitClick}
        />

        <SandboxNodesLayer
          model={model}
          nodes={nodes}
          selectedElementId={selectedElementId}
          pairAnchors={pairAnchors}
          overlayBadgeByElementId={overlayBadgeByElementId}
          overlayScaleByElementId={overlayScaleByElementId}
          onPointerDownNode={onPointerDownNode}
          onClickNode={onClickNode}
          onDoubleClickNode={onDoubleClickNode}
        />
      </svg>
    </div>
  );
}
