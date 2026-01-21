import { createEmptyModel, createElement, createRelationship, createView } from '../../../domain/factories';
import type { Model, View } from '../../../domain/types';
import { addElementToViewAt } from '../layout';
import { autoLayoutView } from '../autoLayout';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

function putView(model: Model, view: View): void {
  model.views[view.id] = view;
  const rootId = getRootFolderId(model);
  model.folders[rootId] = { ...model.folders[rootId], viewIds: [...model.folders[rootId].viewIds, view.id] };
}

describe('autoLayoutView mutation invariants', () => {
  test('updates node x/y for ids present in positions and leaves others unchanged', () => {
    const model = createEmptyModel({ name: 'M' });
    const e1 = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const e2 = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;

    const rel = createRelationship({
      name: 'r',
      type: 'Association',
      sourceElementId: e1.id,
      targetElementId: e2.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, e1.id, 10, 10);
    addElementToViewAt(model, view.id, e2.id, 50, 10);

    const before = model.views[view.id].layout.nodes.map((n) => ({ id: n.elementId, x: n.x, y: n.y }));

    autoLayoutView(model, view.id, {
      [e1.id]: { x: 100, y: 200 }
      // e2 omitted on purpose
    });

    const afterNodes = model.views[view.id].layout.nodes;
    const n1 = afterNodes.find((n) => n.elementId === e1.id);
    const n2 = afterNodes.find((n) => n.elementId === e2.id);

    expect(n1?.x).toBe(100);
    expect(n1?.y).toBe(200);
    // unchanged
    expect(n2?.x).toBe(before.find((b) => b.id === e2.id)?.x);
    expect(n2?.y).toBe(before.find((b) => b.id === e2.id)?.y);
  });
});
