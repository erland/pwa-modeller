import { createEmptyModel, createElement } from '../../../domain/factories';
import type { Model } from '../../../domain/types';
import { deleteElement, setElementParent } from '../elements';
import { createFolder, moveElementToFolder } from '../folders';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

describe('store mutations: elements containment', () => {
  test('setElementParent sets/clears parentElementId and prevents cycles', () => {
    const model = createEmptyModel({ name: 'M' });

    const parent = createElement({ name: 'P', layer: 'Business', type: 'BusinessActor' });
    const child = createElement({ name: 'C', layer: 'Business', type: 'BusinessRole' });
    model.elements[parent.id] = parent;
    model.elements[child.id] = child;

    setElementParent(model, child.id, parent.id);
    expect(model.elements[child.id].parentElementId).toBe(parent.id);

    // Prevent cycles: cannot make parent a child of its own descendant.
    expect(() => setElementParent(model, parent.id, child.id)).toThrow(/cycle/i);

    // Clear
    setElementParent(model, child.id, null);
    expect(model.elements[child.id].parentElementId).toBeUndefined();
  });

  test('deleteElement reparents children to deleted element parent', () => {
    const model = createEmptyModel({ name: 'M' });

    const grandParent = createElement({ name: 'GP', layer: 'Business', type: 'BusinessActor' });
    const parent = createElement({ name: 'P', layer: 'Business', type: 'BusinessRole' });
    const child1 = createElement({ name: 'C1', layer: 'Business', type: 'BusinessProcess' });
    const child2 = createElement({ name: 'C2', layer: 'Business', type: 'BusinessProcess' });

    model.elements[grandParent.id] = grandParent;
    model.elements[parent.id] = { ...parent, parentElementId: grandParent.id };
    model.elements[child1.id] = { ...child1, parentElementId: parent.id };
    model.elements[child2.id] = { ...child2, parentElementId: parent.id };

    deleteElement(model, parent.id);

    expect(model.elements[parent.id]).toBeUndefined();
    expect(model.elements[child1.id].parentElementId).toBe(grandParent.id);
    expect(model.elements[child2.id].parentElementId).toBe(grandParent.id);
  });

  test('moveElementToFolder detaches semantic parent', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const randSpy = jest.spyOn(Math, 'random');
    randSpy.mockReturnValueOnce(0.111111111);
    const f1 = createFolder(model, rootId, 'F1');
    randSpy.mockReturnValueOnce(0.222222222);
    const f2 = createFolder(model, rootId, 'F2');
    randSpy.mockRestore();

    const parent = createElement({ name: 'P', layer: 'Business', type: 'BusinessActor' });
    const child = createElement({ name: 'C', layer: 'Business', type: 'BusinessRole' });
    model.elements[parent.id] = parent;
    model.elements[child.id] = { ...child, parentElementId: parent.id };
    model.folders[f1] = { ...model.folders[f1], elementIds: [parent.id, child.id] };

    moveElementToFolder(model, child.id, f2);
    expect(model.elements[child.id].parentElementId).toBeUndefined();
    expect(model.folders[f2].elementIds).toContain(child.id);
  });
});
