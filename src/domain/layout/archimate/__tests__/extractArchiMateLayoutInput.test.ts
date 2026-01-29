import { createEmptyModel, createElement, createRelationship, createView } from '../../../factories';
import type { Model, ViewConnection } from '../../../types';
import { addElementToViewAt } from '../../../../store/mutations/layout';
import { extractArchiMateLayoutInput } from '../extractArchiMateLayoutInput';

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

describe('extractArchiMateLayoutInput', () => {
  test('extracts nodes + edges with ArchiMate policy hints (layer/group + weights)', () => {
    const model = createEmptyModel({ name: 'M' });

    const a = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const b = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({
      name: 'r',
      type: 'Flow',
      sourceElementId: a.id,
      targetElementId: b.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, a.id, 100, 100);
    addElementToViewAt(model, view.id, b.id, 300, 100);

    // Use deterministic view.connections (avoid random vc ids in snapshots).
    const conn: ViewConnection = {
      id: 'c1',
      viewId: view.id,
      relationshipId: rel.id,
      source: { kind: 'element', id: a.id },
      target: { kind: 'element', id: b.id },
      route: { kind: 'orthogonal' }
    };
    model.views[view.id] = { ...model.views[view.id], connections: [conn] };

    const input = extractArchiMateLayoutInput(model, view.id);

    expect(input.nodes.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
    expect(input.edges).toHaveLength(1);
    expect(input.edges[0]).toEqual({
      id: 'c1',
      sourceId: a.id,
      targetId: b.id,
      weight: 10 // Flow
    });

    // Hints should be present for known element types.
    const nodeA = input.nodes.find((n) => n.id === a.id);
    expect(nodeA?.layerHint).toBe('Application');
    expect(nodeA?.groupId).toBe('Application');
  });

  test('selection scope filters nodes and prunes edges whose endpoints are missing', () => {
    const model = createEmptyModel({ name: 'M' });

    const a = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const b = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({
      name: 'r',
      type: 'Flow',
      sourceElementId: a.id,
      targetElementId: b.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
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

    const input = extractArchiMateLayoutInput(model, view.id, { scope: 'selection' }, [a.id]);
    expect(input.nodes).toHaveLength(1);
    expect(input.nodes[0].id).toBe(a.id);
    // Edge removed because target is not in the selection node set.
    expect(input.edges).toHaveLength(0);
  });
});
