import { ModelStore } from '../modelStore';
import { createEmptyModel, createElement, createRelationship, createView } from '../../domain/factories';
import type { Model, View } from '../../domain/types';
import { addElementToViewAt } from '../mutations/layout';
import { elkLayout } from '../../domain/layout/elk/elkLayout';

// Mock ELK adapter to keep tests fast and deterministic.
jest.mock('../../domain/layout/elk/elkLayout', () => ({
  elkLayout: jest.fn(async (input: { nodes: Array<{ id: string }> }) => {
    // Spread nodes out so we don't trigger overlap nudging.
    const positions: Record<string, { x: number; y: number }> = {};
    let x = 13;
    for (const n of input.nodes) {
      positions[n.id] = { x, y: 17 };
      x += 1000;
    }
    return { positions };
  })
}));

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

describe('ModelStore.autoLayoutView (ArchiMate)', () => {
  test('runs layout and applies snapped positions to view nodes', async () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const b = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({ name: 'r', type: 'Flow', sourceElementId: a.id, targetElementId: b.id });
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

    const store = new ModelStore();
    store.loadModel(model);

    const before = store.getState().model!.views[view.id].layout!.nodes.map((n) => ({ id: n.elementId, x: n.x, y: n.y }));

    await store.autoLayoutView(view.id);

    const afterNodes = store.getState().model!.views[view.id].layout!.nodes;
    const na = afterNodes.find((n) => n.elementId === a.id)!;
    const nb = afterNodes.find((n) => n.elementId === b.id)!;

    // Mock returns {13,17} and {1013,17}, then store snaps to GRID=10.
    const xs = [na.x, nb.x].sort((a, b) => a - b);
    expect(xs).toEqual([10, 1010]);
    expect(na.y).toBe(20);
    expect(nb.y).toBe(20);

    // Sanity: positions actually changed.
    expect(before.some((p) => p.id === a.id && (p.x !== na.x || p.y !== na.y))).toBe(true);
    expect(before.some((p) => p.id === b.id && (p.x !== nb.x || p.y !== nb.y))).toBe(true);
  });

  test('respectLocked keeps locked nodes fixed (even if ELK returns new positions)', async () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const b = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, a.id, 100, 100);
    addElementToViewAt(model, view.id, b.id, 300, 100);

    // Lock A.
    const v = model.views[view.id];
    const nextNodes = v.layout!.nodes.map((n) => (n.elementId === a.id ? { ...n, locked: true } : n));
    model.views[view.id] = { ...v, layout: { ...v.layout!, nodes: nextNodes } };

    const store = new ModelStore();
    store.loadModel(model);

    const beforeA = store.getState().model!.views[view.id].layout!.nodes.find((n) => n.elementId === a.id)!;

    await store.autoLayoutView(view.id, { respectLocked: true });

    const afterA = store.getState().model!.views[view.id].layout!.nodes.find((n) => n.elementId === a.id)!;
    expect(afterA.x).toBe(beforeA.x);
    expect(afterA.y).toBe(beforeA.y);
  });

  test('re-running with same graph uses cached ELK output (no extra elkLayout call)', async () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', type: 'ApplicationComponent', layer: 'Application' });
    const b = createElement({ name: 'B', type: 'ApplicationComponent', layer: 'Application' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const view = createView({
      name: 'V',
      kind: 'archimate',
      viewpointId: 'layered',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, a.id, 100, 100);
    addElementToViewAt(model, view.id, b.id, 300, 100);

    const store = new ModelStore();
    store.loadModel(model);

    const fn = elkLayout as unknown as jest.Mock;
    fn.mockClear();

    await store.autoLayoutView(view.id);
    expect(fn.mock.calls.length).toBe(1);

    // Run again without changing graph/options. Should reuse cache and skip ELK call.
    await store.autoLayoutView(view.id);
    expect(fn.mock.calls.length).toBe(1);
  });
});
