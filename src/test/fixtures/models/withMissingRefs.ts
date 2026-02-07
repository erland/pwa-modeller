import type { Model } from '../../../domain/types';
import { makeElement, makeRelationship, makeView, makeViewLayout, makeViewNode, makeViewRelationshipLayout, makeModelWithContent, makeIdFactory } from '../../builders/modelBuilders';

/**
 * Fixture that intentionally includes missing references:
 * - a view node points to a non-existent element
 * - a relationship references a missing target element
 *
 * Useful for tests that confirm "skip invalid refs" behavior.
 */
export function buildModelWithMissingRefs(): Model {
  const id = makeIdFactory('missing');

  const a = makeElement({ id: 'e_a', type: 'ApplicationService', name: 'Service A' }, id);

  // Relationship references a missing element id on purpose
  const r = makeRelationship(
    {
      id: 'r_a_missing',
      type: 'Serving',
      sourceElementId: a.id,
      targetElementId: 'e_missing_target',
    },
    id,
  );

  const view = makeView(
    {
      id: 'v_missing',
      kind: 'archimate',
      name: 'Missing Refs View',
      viewpointId: 'layered',
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ elementId: a.id, x: 120, y: 120, width: 160, height: 70 }),
          // Missing element ref
          makeViewNode({ elementId: 'e_missing_node', x: 400, y: 120, width: 160, height: 70 }),
        ],
        relationships: [makeViewRelationshipLayout({ relationshipId: r.id })],
      }),
      connections: [],
    },
    id,
  );

  return makeModelWithContent(
    {
      metadata: { name: 'With Missing Refs' },
      elements: [a],
      relationships: [r],
      views: [view],
    },
    id,
  );
}
