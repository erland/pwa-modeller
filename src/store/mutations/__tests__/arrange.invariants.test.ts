import { createEmptyModel, createElement, createView } from '../../../domain/factories';
import type { Model, View } from '../../../domain/types';
import { addElementToViewAt } from '../layout';
import { distributeViewElements, sameSizeViewElements } from '../arrange';

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

describe('arrange mutations invariants', () => {
  test('sameSizeViewElements updates width and height on selected element nodes', () => {
    const model = createEmptyModel({ name: 'M' });
    const e1 = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const e2 = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model),
    });
    putView(model, view);

    addElementToViewAt(model, view.id, e1.id, 200, 80);
    addElementToViewAt(model, view.id, e2.id, 80, 80);

    // Force distinct sizes for determinism.
    const layout = model.views[view.id].layout;
    const nextNodes = layout.nodes.map((n) => {
      if (n.elementId === e1.id) return { ...n, width: 180, height: 90 };
      if (n.elementId === e2.id) return { ...n, width: 120, height: 60 };
      return n;
    });
    model.views[view.id] = { ...model.views[view.id], layout: { ...layout, nodes: nextNodes } };

    sameSizeViewElements(model, view.id, [e1.id, e2.id], 'both');

    const after = model.views[view.id].layout.nodes;
    const n1 = after.find((n) => n.elementId === e1.id);
    const n2 = after.find((n) => n.elementId === e2.id);
    expect(n1?.width).toBe(180);
    expect(n1?.height).toBe(90);
    expect(n2?.width).toBe(180);
    expect(n2?.height).toBe(90);
  });

  test('distributeViewElements distributes horizontally keeping the first and last node fixed', () => {
    const model = createEmptyModel({ name: 'M' });
    const e1 = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const e2 = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    const e3 = createElement({ name: 'C', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;
    model.elements[e3.id] = e3;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model),
    });
    putView(model, view);

    // Place nodes with clear spacing.
    addElementToViewAt(model, view.id, e1.id, 100, 60);
    addElementToViewAt(model, view.id, e2.id, 320, 60);
    addElementToViewAt(model, view.id, e3.id, 560, 60);

    // Force the same size to make the math stable.
    const layout = model.views[view.id].layout;
    const sizedNodes = layout.nodes.map((n) => {
      if (!n.elementId) return n;
      return { ...n, width: 140, height: 70 };
    });
    model.views[view.id] = { ...model.views[view.id], layout: { ...layout, nodes: sizedNodes } };

    const before = model.views[view.id].layout.nodes
      .filter((n) => n.elementId)
      .map((n) => ({ id: n.elementId as string, x: n.x, w: n.width ?? 120 }));

    const ordered = [...before].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id.localeCompare(b.id)));
    const first = ordered[0];
    const mid = ordered[1];
    const last = ordered[2];

    const rangeStart = first.x + first.w;
    const rangeEnd = last.x;
    const available = Math.max(0, rangeEnd - rangeStart - mid.w);
    const gap = available / 2;
    const expectedMidX = Math.round(rangeStart + gap);

    distributeViewElements(model, view.id, [e1.id, e2.id, e3.id], 'horizontal');

    const after = model.views[view.id].layout.nodes
      .filter((n) => n.elementId)
      .map((n) => ({ id: n.elementId as string, x: n.x }));
    const aMap = new Map(after.map((n) => [n.id, n.x]));

    expect(aMap.get(first.id)).toBe(first.x);
    expect(aMap.get(last.id)).toBe(last.x);
    expect(aMap.get(mid.id)).toBe(expectedMidX);
  });
});
