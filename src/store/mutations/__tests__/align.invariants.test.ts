import { createEmptyModel, createElement, createView } from '../../../domain/factories';
import type { Model, View } from '../../../domain/types';
import { addElementToViewAt } from '../layout';
import { alignViewElements } from '../align';

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

describe('alignViewElements mutation invariants', () => {
  test('aligns selected nodes to the left edge of the selection bounds', () => {
    const model = createEmptyModel({ name: 'M' });
    const e1 = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const e2 = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    // Note: addElementToViewAt() treats (x,y) as cursor position and centers the node, clamping to >= 0.
    addElementToViewAt(model, view.id, e1.id, 120, 45);
    addElementToViewAt(model, view.id, e2.id, 80, 75);

    const before = model.views[view.id].layout.nodes;
    const b1 = before.find((n) => n.elementId === e1.id);
    const b2 = before.find((n) => n.elementId === e2.id);
    if (!b1 || !b2) throw new Error('Expected view nodes to exist');
    const expectedMinX = Math.min(b1.x, b2.x);

    alignViewElements(model, view.id, [e1.id, e2.id], 'left');

    const nodes = model.views[view.id].layout.nodes;
    const n1 = nodes.find((n) => n.elementId === e1.id);
    const n2 = nodes.find((n) => n.elementId === e2.id);

    expect(n1?.x).toBe(expectedMinX);
    expect(n2?.x).toBe(expectedMinX);
  });

  test('does not move locked nodes', () => {
    const model = createEmptyModel({ name: 'M' });
    const e1 = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const e2 = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, e1.id, 170, 45);
    addElementToViewAt(model, view.id, e2.id, 80, 45);

    // Lock e1
    const layout = model.views[view.id].layout;
    const beforeNodes = layout.nodes;
    const b1 = beforeNodes.find((n) => n.elementId === e1.id);
    const b2 = beforeNodes.find((n) => n.elementId === e2.id);
    if (!b1 || !b2) throw new Error('Expected view nodes to exist');

    const expectedLockedX = b1.x;
    const expectedMinX = Math.min(b1.x, b2.x);

    const nextNodes = beforeNodes.map((n) => (n.elementId === e1.id ? { ...n, locked: true } : n));
    model.views[view.id] = { ...model.views[view.id], layout: { ...layout, nodes: nextNodes } };

    alignViewElements(model, view.id, [e1.id, e2.id], 'left');

    const after = model.views[view.id].layout.nodes;
    const n1 = after.find((n) => n.elementId === e1.id);
    const n2 = after.find((n) => n.elementId === e2.id);

    // Locked node stays fixed; unlocked node aligns to the selection minX.
    expect(n1?.x).toBe(expectedLockedX);
    expect(n2?.x).toBe(expectedMinX);
  });
});
