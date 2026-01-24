import { createGenericAnalysisAdapter } from '../generic';
import { getAnalysisAdapter, getAnalysisAdapterOrGeneric } from '../registry';
import { getElementTypeLabel, getRelationshipTypeLabel } from '../../../domain';
import type { AnalysisEdge } from '../../../domain/analysis/graph';
import type { Element, Model, Relationship } from '../../../domain/types';

function makeModel(partial: Partial<Model>): Model {
  const base: Model = {
    id: 'm1',
    metadata: { name: 'm' },
    elements: {},
    relationships: {},
    views: {},
    folders: {},
    taggedValues: [],
    externalIds: []
  };
  return Object.assign(base, partial);
}

describe('analysis adapters (generic + registry)', () => {
  test('generic adapter returns name-only label and "(unnamed)" fallback', () => {
    const adapter = createGenericAnalysisAdapter('bpmn');
    const model = makeModel({
      elements: {
        e1: { id: 'e1', name: '', type: 'bpmn.task', taggedValues: [], externalIds: [] } as Element
      }
    });

    expect(adapter.getNodeLabel({ id: 'e1', name: '', type: 'bpmn.task', taggedValues: [], externalIds: [] } as Element, model)).toBe(
      '(unnamed)'
    );
  });

  test('generic adapter uses friendly labels for known element + relationship types', () => {
    const adapter = createGenericAnalysisAdapter('bpmn');

    const el: Element = { id: 'e1', name: 'Task', type: 'bpmn.task', taggedValues: [], externalIds: [] };
    const rel: Relationship = {
      id: 'r1',
      type: 'bpmn.sequenceFlow',
      sourceElementId: 'e1',
      targetElementId: 'e2',
      taggedValues: [],
      externalIds: []
    };

    const model = makeModel({
      elements: { e1: el, e2: { id: 'e2', name: 'Other', type: 'bpmn.task', taggedValues: [], externalIds: [] } },
      relationships: { r1: rel }
    });

    const facets = adapter.getNodeFacetValues(el, model);
    expect(facets.type).toBe(getElementTypeLabel('bpmn.task'));
    expect(facets.elementType).toBe('bpmn.task');

    const edge: AnalysisEdge = {
      relationshipId: 'r1',
      relationshipType: 'bpmn.sequenceFlow',
      relationship: rel,
      fromId: 'e1',
      toId: 'e2',
      reversed: false,
      undirected: false
    };

    expect(adapter.getEdgeLabel(edge, model)).toBe(getRelationshipTypeLabel('bpmn.sequenceFlow'));
    expect(adapter.isEdgeDirected(edge, model)).toBe(true);
  });

  test('registry returns known adapters and provides generic fallback for unknown kind', () => {
    expect(getAnalysisAdapter('bpmn').id).toBe('bpmn');
    expect(getAnalysisAdapter('uml').id).toBe('uml');
    expect(getAnalysisAdapter('archimate').id).toBe('archimate');

    const fallback = getAnalysisAdapterOrGeneric('not-a-kind');
    // Fallback adapter is generic but uses a ModelKind-compatible id.
    expect(fallback.id).toBe('archimate');

    const model = makeModel({
      elements: { e1: { id: 'e1', name: 'X', type: 'bpmn.task', taggedValues: [], externalIds: [] } }
    });
    const label = fallback.getNodeFacetValues(model.elements.e1 as Element, model).type;
    expect(label).toBe(getElementTypeLabel('bpmn.task'));
  });
});
