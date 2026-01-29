import { createEmptyModel, createElement, createRelationship, createView } from '../../../factories';
import type { Model, ViewConnection } from '../../../types';
import { addElementToViewAt } from '../../../../store/mutations/layout';
import { extractUmlLayoutInput } from '../extractUmlLayoutInput';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

function putView(model: Model, view: ReturnType<typeof createView>): void {
  model.views[view.id] = view;
  const rootId = getRootFolderId(model);
  model.folders[rootId] = { ...model.folders[rootId], viewIds: [...model.folders[rootId].viewIds, view.id] };
}

describe('extractUmlLayoutInput', () => {
  test('extracts nodes + edges and applies simple UML edge-weight heuristics', () => {
    const model = createEmptyModel({ name: 'M' });

    const a = createElement({ id: 'A', name: 'Class A', type: 'uml.class' });
    const b = createElement({ id: 'B', name: 'Class B', type: 'uml.class' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({
      id: 'R1',
      name: 'gen',
      type: 'uml.generalization',
      sourceElementId: b.id,
      targetElementId: a.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'UML View',
      kind: 'uml',
      viewpointId: 'uml',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, a.id, 100, 100);
    addElementToViewAt(model, view.id, b.id, 300, 100);

    const conn: ViewConnection = {
      id: 'c1',
      viewId: view.id,
      relationshipId: rel.id,
      source: { kind: 'element', id: b.id },
      target: { kind: 'element', id: a.id },
      route: { kind: 'orthogonal' }
    };
    model.views[view.id] = { ...model.views[view.id], connections: [conn] };

    const input = extractUmlLayoutInput(model, view.id);

    expect(input.nodes.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
    const nodeA = input.nodes.find((n) => n.id === a.id);
    expect(nodeA?.kind).toBe('uml.class');
    expect(nodeA?.label).toBe('Class A');

    expect(input.edges).toHaveLength(1);
    expect(input.edges[0]).toEqual({
      id: 'c1',
      sourceId: b.id,
      targetId: a.id,
      weight: 5,
      kind: 'uml.generalization'
    });
  });

  test('selection scope filters nodes and prunes edges whose endpoints are missing', () => {
    const model = createEmptyModel({ name: 'M' });

    const a = createElement({ id: 'A', name: 'Class A', type: 'uml.class' });
    const b = createElement({ id: 'B', name: 'Class B', type: 'uml.class' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({
      id: 'R1',
      name: 'dep',
      type: 'uml.dependency',
      sourceElementId: a.id,
      targetElementId: b.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'UML View',
      kind: 'uml',
      viewpointId: 'uml',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, a.id, 100, 100);
    addElementToViewAt(model, view.id, b.id, 300, 100);

    const conn: ViewConnection = {
      id: 'c1',
      viewId: view.id,
      relationshipId: rel.id,
      source: { kind: 'element', id: a.id },
      target: { kind: 'element', id: b.id },
      route: { kind: 'orthogonal' }
    };
    model.views[view.id] = { ...model.views[view.id], connections: [conn] };

    const input = extractUmlLayoutInput(model, view.id, { scope: 'selection' }, [a.id]);
    expect(input.nodes).toHaveLength(1);
    expect(input.nodes[0].id).toBe(a.id);
    expect(input.edges).toHaveLength(0);
  });
});
