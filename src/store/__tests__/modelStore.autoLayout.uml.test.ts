import { ModelStore } from '../modelStore';
import { createEmptyModel, createElement, createRelationship, createView } from '../../domain/factories';
import type { Model, View } from '../../domain/types';
import { addElementToViewAt, updateViewNodeLayout } from '../mutations/layout';
import { elkLayoutHierarchical } from '../../domain/layout/elk/elkLayoutHierarchical';

// Mock ELK hierarchical adapter to keep tests fast and deterministic.
jest.mock('../../domain/layout/elk/elkLayoutHierarchical', () => ({
  elkLayoutHierarchical: jest.fn(async (input: { nodes: Array<{ id: string }> }) => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of input.nodes) {
      if (n.id === 'PKG') positions[n.id] = { x: 15, y: 15 };
      else if (n.id === 'A') positions[n.id] = { x: 65, y: 55 };
      else if (n.id === 'B') positions[n.id] = { x: 255, y: 55 };
      else positions[n.id] = { x: 15, y: 15 };
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

describe('ModelStore.autoLayoutView (UML)', () => {
  test('packages behave as containers and get a conservative size update', async () => {
    const model = createEmptyModel({ name: 'M' });

    const pkg = createElement({ id: 'PKG', name: 'Package', type: 'uml.package' });
    const a = createElement({ id: 'A', name: 'A', type: 'uml.class' });
    const b = createElement({ id: 'B', name: 'B', type: 'uml.class' });

    model.elements[pkg.id] = pkg;
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({
      id: 'G1',
      name: 'gen',
      type: 'uml.generalization',
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

    addElementToViewAt(model, view.id, pkg.id, 160, 120);
    addElementToViewAt(model, view.id, a.id, 200, 160);
    addElementToViewAt(model, view.id, b.id, 360, 160);

    // Make the package clearly contain the classes, but intentionally small so prep grows it.
    updateViewNodeLayout(model, view.id, pkg.id, { x: 0, y: 0, width: 260, height: 160 });
    updateViewNodeLayout(model, view.id, a.id, { x: 40, y: 40, width: 170, height: 90 });
    updateViewNodeLayout(model, view.id, b.id, { x: 220, y: 40, width: 170, height: 90 });

    const store = new ModelStore();
    store.loadModel(model);

    const fn = elkLayoutHierarchical as unknown as jest.Mock;
    fn.mockClear();

    await store.autoLayoutView(view.id);
    expect(fn.mock.calls.length).toBe(1);

    const v = store.getState().model!.views[view.id];
    const nodes = v.layout!.nodes;
    const pkgNode = nodes.find((n) => n.elementId === pkg.id)!;

    // Conservative grow for safety (should be >= initial size).
    expect(pkgNode.width).toBeGreaterThanOrEqual(260);
    expect(pkgNode.height).toBeGreaterThanOrEqual(160);
  });
});
