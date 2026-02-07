import type { Model } from '../../../domain/types';
import { makeElement, makeRelationship, makeView, makeViewLayout, makeViewNode, makeViewRelationshipLayout, makeModelWithContent, makeIdFactory } from '../../builders/modelBuilders';

/**
 * A minimal, deterministic model with:
 * - 2 elements
 * - 1 relationship
 * - 1 view with a simple layout
 *
 * Useful as a baseline fixture for unit tests.
 */
export function buildTinyGraphModel(): Model {
  const id = makeIdFactory('tiny');

  const a = makeElement({ id: 'e_a', type: 'ApplicationComponent', name: 'A' }, id);
  const b = makeElement({ id: 'e_b', type: 'ApplicationComponent', name: 'B' }, id);

  const r = makeRelationship(
    {
      id: 'r_ab',
      type: 'Serving',
      sourceElementId: a.id,
      targetElementId: b.id,
    },
    id,
  );

  const view = makeView(
    {
      id: 'v_main',
      kind: 'archimate',
      name: 'Main View',
      viewpointId: 'layered',
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ elementId: a.id, x: 100, y: 100, width: 140, height: 60 }),
          makeViewNode({ elementId: b.id, x: 360, y: 100, width: 140, height: 60 }),
        ],
        relationships: [makeViewRelationshipLayout({ relationshipId: r.id })],
      }),
      connections: [],
    },
    id,
  );

  return makeModelWithContent(
    {
      metadata: { name: 'Tiny Graph' },
      elements: [a, b],
      relationships: [r],
      views: [view],
    },
    id,
  );
}
