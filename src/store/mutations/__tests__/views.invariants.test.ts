import { createEmptyModel, createElement, createView, createViewObject, createViewObjectNodeLayout } from '../../../domain/factories';
import type { Model } from '../../../domain/types';
import { addView, cloneView, updateView } from '../views';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

describe('store mutations: views invariants', () => {
  test('addView adds non-centered view to root folder by default', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const view = createView({ name: 'V', viewpointId: 'layered' });
    addView(model, view);

    expect(model.views[view.id]).toBeTruthy();
    expect(model.folders[rootId].viewIds).toContain(view.id);
  });

  test('addView for centered views removes it from any folder lists', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({ name: 'Centered', viewpointId: 'layered', centerElementId: el.id });
    // Simulate bad state: it is listed in root.
    model.folders[rootId] = { ...model.folders[rootId], viewIds: [view.id] };

    addView(model, view);

    expect(model.views[view.id].centerElementId).toBe(el.id);
    expect(model.folders[rootId].viewIds).not.toContain(view.id);
  });

  test('updateView maintains placement invariant when centerElementId is set and cleared', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({ name: 'V', viewpointId: 'layered' });
    addView(model, view);
    expect(model.folders[rootId].viewIds).toContain(view.id);

    // Set centering -> must be removed from folders
    updateView(model, view.id, { centerElementId: el.id });
    expect(model.folders[rootId].viewIds).not.toContain(view.id);

    // Clear centering -> must re-appear in root folder
    updateView(model, view.id, { centerElementId: undefined });
    expect(model.folders[rootId].viewIds).toContain(view.id);
  });

  test('cloneView clones view objects with new ids and remaps layout.objectId references', () => {
    const model = createEmptyModel({ name: 'M' });

    const note = createViewObject({ type: 'Note', text: 'Hello' });
    const group = createViewObject({ type: 'GroupBox', name: 'Scope' });

    const view = createView({
      name: 'Main',
      viewpointId: 'layered',
      objects: {
        [note.id]: note,
        [group.id]: group
      },
      layout: {
        nodes: [
          createViewObjectNodeLayout(group.id, 0, 0, 400, 200, -10),
          createViewObjectNodeLayout(note.id, 20, 20, 200, 120, 0)
        ],
        relationships: []
      }
    });
    addView(model, view);

    const cloneId = cloneView(model, view.id);
    expect(cloneId).toBeTruthy();
    const cloned = model.views[cloneId!];

    // Same amount of objects, different ids
    const originalObjectIds = Object.keys(view.objects ?? {});
    const clonedObjectIds = Object.keys(cloned.objects ?? {});
    expect(clonedObjectIds).toHaveLength(originalObjectIds.length);
    for (const oid of originalObjectIds) {
      expect(clonedObjectIds).not.toContain(oid);
    }

    // Layout nodes should point to cloned object ids, not original ids
    const layoutObjectIds = (cloned.layout?.nodes ?? []).map((n) => n.objectId).filter(Boolean) as string[];
    for (const oid of originalObjectIds) {
      expect(layoutObjectIds).not.toContain(oid);
    }
    for (const oid of clonedObjectIds) {
      expect(layoutObjectIds).toContain(oid);
    }
  });
});
