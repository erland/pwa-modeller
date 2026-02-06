import type { MouseEvent } from 'react';
import { useMemo } from 'react';

import { kindFromTypeId } from '../../../domain';
import { getNotation } from '../../../notations';

import type { Point } from '../../diagram/geometry';
import { polylineMidPoint } from '../../diagram/geometry';
import { markerUrl } from '../../../diagram/relationships/markers';
import { dasharrayForPattern } from '../../../diagram/relationships/style';

import { SANDBOX_NODE_H, SANDBOX_NODE_W } from './sandboxConstants';

export type SandboxRenderableRelationship = {
  id: string;
  type: string;
  sourceElementId: string;
  targetElementId: string;
  attrs?: unknown;
};

export function SandboxEdgesLayer({
  renderedRelationships,
  nodeById,
  edgeRouting,
  orthogonalPointsByRelationshipId,
  selectedEdgeId,
  isRelationshipSelected,
  onEdgeHitClick,
}: {
  renderedRelationships: SandboxRenderableRelationship[];
  nodeById: Map<string, { x: number; y: number }>;
  edgeRouting: 'straight' | 'orthogonal';
  orthogonalPointsByRelationshipId: Map<string, Point[]>;
  selectedEdgeId: string | null;
  isRelationshipSelected: (relationshipId: string) => boolean;
  onEdgeHitClick: (e: MouseEvent<SVGPathElement>, relationshipId: string) => void;
}) {
  // Notations can be mixed per relationship type prefix.
  const archimateNotation = useMemo(() => getNotation('archimate'), []);
  const umlNotation = useMemo(() => getNotation('uml'), []);
  const bpmnNotation = useMemo(() => getNotation('bpmn'), []);

  return (
    <>
      {renderedRelationships.map((r) => {
        const sId = r.sourceElementId as string;
        const tId = r.targetElementId as string;
        const s = nodeById.get(sId);
        const t = nodeById.get(tId);
        if (!s || !t) return null;

        const x1 = s.x + SANDBOX_NODE_W / 2;
        const y1 = s.y + SANDBOX_NODE_H / 2;
        const x2 = t.x + SANDBOX_NODE_W / 2;
        const y2 = t.y + SANDBOX_NODE_H / 2;

        const orthoPoints = edgeRouting === 'orthogonal' ? orthogonalPointsByRelationshipId.get(r.id) ?? null : null;
        const points: Point[] =
          orthoPoints ??
          [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ];

        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');

        const isSelected = selectedEdgeId === r.id || isRelationshipSelected(r.id);

        const relKind = kindFromTypeId(String(r.type));
        const relNotation = relKind === 'uml' ? umlNotation : relKind === 'bpmn' ? bpmnNotation : archimateNotation;
        const relStyle = relNotation.getRelationshipStyle({ type: String(r.type), attrs: r.attrs });
        const dasharray = relStyle.line?.dasharray ?? dasharrayForPattern(relStyle.line?.pattern);
        const markerStart = markerUrl(relStyle.markerStart, isSelected);
        const markerEnd = markerUrl(relStyle.markerEnd, isSelected);
        const mid = relStyle.midLabel ? polylineMidPoint(points) : null;

        return (
          <g key={r.id} className="analysisSandboxEdge">
            <path className="diagramRelHit" d={d} style={{ strokeWidth: 16 }} onClick={(e) => onEdgeHitClick(e, r.id)} />
            <path
              className={'diagramRelLine' + (isSelected ? ' isSelected' : '')}
              d={d}
              data-relationship-id={r.id}
              data-relationship-type={String(r.type)}
              data-source-element-id={String(r.sourceElementId)}
              data-target-element-id={String(r.targetElementId)}
              markerStart={markerStart}
              markerEnd={markerEnd}
              strokeDasharray={dasharray ?? undefined}
            />

            {mid ? (
              <text
                x={mid.x}
                y={mid.y - 6}
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial"
                fontSize={12}
                fontWeight={800}
                fill="rgba(0,0,0,0.65)"
                textAnchor="middle"
                pointerEvents="none"
              >
                {relStyle.midLabel}
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}
