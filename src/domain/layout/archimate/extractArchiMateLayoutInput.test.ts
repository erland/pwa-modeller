import { createEmptyModel, createElement, createRelationship, createView } from '../../factories';
import type { ViewConnection } from '../../types';
import { extractArchiMateLayoutInput } from './extractArchiMateLayoutInput';

describe('extractArchiMateLayoutInput', () => {
  test('extracts nodes and edges from view.connections', () => {
    const model = createEmptyModel({ name: 'Test' });

    const e1 = createElement({
      name: 'A',
      type: 'Capability',
      kind: 'archimate',
      layer: 'Business',
      taggedValues: [],
      externalIds: {}
    });
    const e2 = createElement({
      name: 'B',
      type: 'Capability',
      kind: 'archimate',
      layer: 'Business',
      taggedValues: [],
      externalIds: {}
    });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;

    const rel = createRelationship({
      type: 'Association',
      sourceElementId: e1.id,
      targetElementId: e2.id,
      taggedValues: [],
      externalIds: {}
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'View',
      viewpointId: 'vp1',
      kind: 'archimate',
      documentation: undefined,
      stakeholders: [],
      formatting: { snapToGrid: true, gridSize: 20, layerStyleTags: {} },
      connections: [],
      objects: {},
      taggedValues: [],
      externalIds: {},
      layout: {
        nodes: [
          { elementId: e1.id, x: 0, y: 0, width: 120, height: 60 },
          { elementId: e2.id, x: 240, y: 0, width: 120, height: 60 }
        ],
        relationships: []
      }
    });
    model.views[view.id] = view;

    const connections: ViewConnection[] = [
      {
        id: 'c1',
        viewId: view.id,
        relationshipId: rel.id,
        source: { kind: 'element', id: e1.id },
        target: { kind: 'element', id: e2.id },
        route: { kind: 'straight' }
      }
    ];
    view.connections = connections;

    const input = extractArchiMateLayoutInput(model, view.id, { scope: 'all' });
    expect(input.nodes).toHaveLength(2);
    expect(input.edges).toHaveLength(1);
    expect(input.edges[0].sourceId).toBe(e1.id);
    expect(input.edges[0].targetId).toBe(e2.id);
  });

  test('supports selection scope when selection ids are provided', () => {
    const model = createEmptyModel({ name: 'Test' });

    const e1 = createElement({
      name: 'A',
      type: 'Capability',
      kind: 'archimate',
      layer: 'Business',
      taggedValues: [],
      externalIds: {}
    });
    const e2 = createElement({
      name: 'B',
      type: 'Capability',
      kind: 'archimate',
      layer: 'Business',
      taggedValues: [],
      externalIds: {}
    });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;

    const rel = createRelationship({
      type: 'Association',
      sourceElementId: e1.id,
      targetElementId: e2.id,
      taggedValues: [],
      externalIds: {}
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'View',
      viewpointId: 'vp1',
      kind: 'archimate',
      documentation: undefined,
      stakeholders: [],
      formatting: { snapToGrid: true, gridSize: 20, layerStyleTags: {} },
      connections: [],
      objects: {},
      taggedValues: [],
      externalIds: {},
      layout: {
        nodes: [
          { elementId: e1.id, x: 0, y: 0, width: 120, height: 60 },
          { elementId: e2.id, x: 240, y: 0, width: 120, height: 60 }
        ],
        relationships: []
      }
    });
    model.views[view.id] = view;

    const connections: ViewConnection[] = [
      {
        id: 'c1',
        viewId: view.id,
        relationshipId: rel.id,
        source: { kind: 'element', id: e1.id },
        target: { kind: 'element', id: e2.id },
        route: { kind: 'straight' }
      }
    ];
    view.connections = connections;

    const input = extractArchiMateLayoutInput(model, view.id, { scope: 'selection' }, [e1.id]);
    expect(input.nodes).toHaveLength(1);
    expect(input.nodes[0].id).toBe(e1.id);
    expect(input.edges).toHaveLength(0);
  });
});
