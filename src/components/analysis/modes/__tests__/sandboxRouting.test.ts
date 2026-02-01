import { computeSandboxOrthogonalPointsByRelationshipId } from '../sandboxRouting';

import type { SandboxRenderableRelationship } from '../SandboxEdgesLayer';
import type { SandboxNode } from '../../workspace/controller/sandboxTypes';

function isFinitePoint(p: { x: number; y: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function isOrthogonalPolyline(points: Array<{ x: number; y: number }>): boolean {
  if (points.length < 2) return false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!(a.x === b.x || a.y === b.y)) return false;
  }
  return true;
}

describe('sandboxRouting', () => {
  test('returns only routes for valid relationships, and polylines are orthogonal', () => {
    const nodes: SandboxNode[] = [
      { id: 'N1', elementId: 'A', x: 0, y: 0, pinned: false },
      { id: 'N2', elementId: 'B', x: 320, y: 0, pinned: false },
      // obstacle roughly between A and B
      { id: 'N3', elementId: 'C', x: 160, y: 0, pinned: false },
    ];

    const relationships: SandboxRenderableRelationship[] = [
      {
        id: 'R1',
        relationshipId: 'R1',
        relationshipType: 'Flow',
        sourceElementId: 'A',
        targetElementId: 'B',
        sourceNodeId: 'N1',
        targetNodeId: 'N2',
        isDirected: true,
      },
      // invalid: missing node
      {
        id: 'R2',
        relationshipId: 'R2',
        relationshipType: 'Flow',
        sourceElementId: 'A',
        targetElementId: 'MISSING',
        sourceNodeId: 'N1',
        targetNodeId: 'NOPE',
        isDirected: true,
      },
    ];

    const byId = computeSandboxOrthogonalPointsByRelationshipId({
      nodes,
      renderedRelationships: relationships,
      nodeW: 120,
      nodeH: 60,
      gridSize: 20,
    });

    expect(Array.from(byId.keys()).sort()).toEqual(['R1']);

    const pts = byId.get('R1');
    expect(pts).toBeDefined();
    expect(pts!.length).toBeGreaterThanOrEqual(2);
    expect(pts!.every(isFinitePoint)).toBe(true);
    expect(isOrthogonalPolyline(pts!)).toBe(true);
  });

  test('returns empty map when no relationships', () => {
    const byId = computeSandboxOrthogonalPointsByRelationshipId({
      nodes: [{ id: 'N1', elementId: 'A', x: 0, y: 0, pinned: false }],
      renderedRelationships: [],
      nodeW: 120,
      nodeH: 60,
      gridSize: 20,
    });

    expect(byId.size).toBe(0);
  });
});
