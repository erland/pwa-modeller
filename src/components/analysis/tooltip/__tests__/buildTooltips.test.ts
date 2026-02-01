import type { AnalysisAdapter } from '../../../../analysis/adapters/AnalysisAdapter';
import type { Model, Relationship, TraversalStep } from '../../../../domain';
import { getElementTypeLabel, getRelationshipTypeLabel } from '../../../../domain';

import { buildElementTooltip, buildRelationshipTooltipFromRelationshipId, buildRelationshipTooltipFromTraversalStep } from '../buildTooltips';

function makeModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test model' },
    elements: {
      A: { id: 'A', kind: 'uml', type: 'uml.class', name: 'Alpha' },
      B: { id: 'B', kind: 'uml', type: 'uml.class', name: 'Beta' },
    },
    relationships: {
      R1: {
        id: 'R1',
        kind: 'uml',
        type: 'uml.association',
        sourceElementId: 'A',
        targetElementId: 'B',
        name: 'links',
        documentation: 'Some relationship documentation that should be snippeted.',
      },
    },
    views: {},
    folders: {
      root: {
        id: 'root',
        name: 'Root',
        kind: 'root',
        folderIds: [],
        elementIds: [],
        relationshipIds: [],
        viewIds: [],
      },
    },
  };
}

const adapter: AnalysisAdapter = {
  id: 'uml',
  getNodeLabel: (node) => node.name,
  getEdgeLabel: (edge) => {
    const rel = edge.relationship as Relationship | undefined;
    return rel?.name ? `${getRelationshipTypeLabel(edge.relationshipType)} — ${rel.name}` : getRelationshipTypeLabel(edge.relationshipType);
  },
  isEdgeDirected: () => false,
  getFacetDefinitions: () => [],
  getNodeFacetValues: (node) => ({
    elementType: node.type,
    layer: node.layer,
  }),
};

describe('buildTooltips tooltip contract', () => {
  test('element tooltip uses human-readable type label and does not include element id', () => {
    const model = makeModel();
    const tip = buildElementTooltip(adapter, model, 'A');

    expect(tip).not.toBeNull();
    expect(tip?.title).toBe('Alpha');

    // Human-readable label ("Class"), not the raw type id ("uml.class").
    const expectedLabel = getElementTypeLabel('uml.class');
    expect(tip?.lines).toEqual(expect.arrayContaining([`Type: ${expectedLabel}`]));
    expect(tip?.lines.join('\n')).not.toContain('uml.class');

    // Contract: element id is never exposed in a dedicated field.
    expect(tip?.lines.join('\n')).not.toContain('ElementId:');
  });

  test('relationship tooltip by id uses human-readable type label and does not include relationship id', () => {
    const model = makeModel();
    const tip = buildRelationshipTooltipFromRelationshipId(model, {
      relationshipId: 'R1',
      relationshipType: null,
      fromId: 'A',
      toId: 'B',
      labelForId: (id) => model.elements[id]?.name ?? id,
    });

    expect(tip).not.toBeNull();

    const expectedLabel = getRelationshipTypeLabel('uml.association');
    expect(tip?.lines).toEqual(expect.arrayContaining([`Type: ${expectedLabel}`]));
    expect(tip?.lines.join('\n')).not.toContain('uml.association');

    // Should show endpoints by label, not ids.
    expect(tip?.lines).toEqual(expect.arrayContaining(['From: Alpha', 'To: Beta']));

    // No relationship ids in tooltip payload.
    expect(tip?.lines.join('\n')).not.toContain('R1');
  });

  test('relationship tooltip from traversal step uses relationship type label and endpoint labels', () => {
    const model = makeModel();
    const step: TraversalStep = {
      relationshipId: 'R1',
      relationshipType: 'uml.association',
      relationship: model.relationships.R1,
      fromId: 'A',
      toId: 'B',
      reversed: false,
    };

    const tip = buildRelationshipTooltipFromTraversalStep(adapter, model, step, (id) => model.elements[id]?.name ?? id);
    expect(tip).not.toBeNull();

    // Contract: show the human-friendly type label.
    const expectedLabel = getRelationshipTypeLabel('uml.association');
    expect(tip?.lines).toEqual(expect.arrayContaining([`Type: ${expectedLabel}`]));

    // Contract: show endpoints by label.
    expect(tip?.lines).toEqual(expect.arrayContaining(['From: Alpha', 'To: Beta']));

    // Contract: never show ids.
    const text = tip?.lines.join('\n') ?? '';
    expect(text).not.toContain('R1');

    // Don't show raw endpoint ids as the full label value.
    // NOTE: Use anchored line-regex because "From: Alpha" contains "From: A" as a substring.
    expect(text).not.toMatch(/^From:\s*A\s*$/m);
    expect(text).not.toMatch(/^To:\s*B\s*$/m);

    // And do show human labels.
    expect(text).toContain('From: Alpha');
    expect(text).toContain('To: Beta');
  });
});
