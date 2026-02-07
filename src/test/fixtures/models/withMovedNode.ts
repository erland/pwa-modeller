import type { Model } from '../../../domain/types';
import { makeElement, makeRelationship, makeView, makeViewLayout, makeViewNode, makeViewRelationshipLayout, makeModelWithContent, makeIdFactory } from '../../builders/modelBuilders';

/**
 * Fixture where one node is "moved" relative to a stored route.
 * Intended for tests around route adjustment / post-processing.
 */
export function buildModelWithMovedNode(): Model {
  const id = makeIdFactory('moved');

  const a = makeElement({ id: 'e_a', type: 'BusinessActor', name: 'Actor A' }, id);
  const b = makeElement({ id: 'e_b', type: 'BusinessProcess', name: 'Process B' }, id);

  const r = makeRelationship(
    {
      id: 'r_ab',
      type: 'Assignment',
      sourceElementId: a.id,
      targetElementId: b.id,
    },
    id,
  );

  // The relationship layout contains points that *won't* perfectly match endpoints,
  // simulating an outdated route after a node move.
  const view = makeView(
    {
      id: 'v_moved',
      kind: 'archimate',
      name: 'Moved Node View',
      viewpointId: 'layered',
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ elementId: a.id, x: 80, y: 120, width: 140, height: 60 }),
          // B is placed far away (simulating a move)
          makeViewNode({ elementId: b.id, x: 520, y: 300, width: 160, height: 70 }),
        ],
        relationships: [
          makeViewRelationshipLayout({
            relationshipId: r.id,
            points: [
              { x: 220, y: 150 },
              { x: 320, y: 150 },
              { x: 320, y: 220 },
              { x: 520, y: 220 },
            ],
          }),
        ],
      }),
      connections: [],
    },
    id,
  );

  return makeModelWithContent(
    {
      metadata: { name: 'With Moved Node' },
      elements: [a, b],
      relationships: [r],
      views: [view],
    },
    id,
  );
}
