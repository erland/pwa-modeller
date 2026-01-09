import { createEmptyModel, createElement, createView } from '../../../domain/factories';
import type { Model } from '../../../domain/types';
import {
  createFolder,
  deleteFolder,
  moveElementToFolder,
  moveViewToElement,
  moveViewToFolder,
  renameFolder
} from '../folders';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

describe('store mutations: folders invariants', () => {
  test('createFolder adds folder under parent and trims name', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const randSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    const id = createFolder(model, rootId, '  Child  ');
    randSpy.mockRestore();

    expect(id).toMatch(/^folder_/);
    expect(model.folders[rootId].folderIds).toContain(id);

    const child = model.folders[id];
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(rootId);
    expect(child.name).toBe('Child');
  });

  test('moveElementToFolder moves element id between folders', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const randSpy = jest.spyOn(Math, 'random');
    randSpy.mockReturnValueOnce(0.111111111);
    const f1 = createFolder(model, rootId, 'F1');
    randSpy.mockReturnValueOnce(0.222222222);
    const f2 = createFolder(model, rootId, 'F2');
    randSpy.mockRestore();

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;
    model.folders[f1] = { ...model.folders[f1], elementIds: [el.id] };

    moveElementToFolder(model, el.id, f2);

    expect(model.folders[f1].elementIds).not.toContain(el.id);
    expect(model.folders[f2].elementIds).toContain(el.id);
  });

  test('moveViewToFolder clears centering and ensures view is listed only in target folder', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const randSpy = jest.spyOn(Math, 'random').mockReturnValue(0.333333333);
    const targetFolderId = createFolder(model, rootId, 'Target');
    randSpy.mockRestore();

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({ name: 'Centered', viewpointId: 'layered', centerElementId: el.id });
    model.views[view.id] = view;

    // Defensive: even if a centered view was incorrectly listed in root, moving should clean it up.
    model.folders[rootId] = { ...model.folders[rootId], viewIds: [view.id] };

    moveViewToFolder(model, view.id, targetFolderId);

    expect(model.views[view.id].centerElementId).toBeUndefined();
    expect(model.folders[targetFolderId].viewIds).toContain(view.id);
    expect(model.folders[rootId].viewIds).not.toContain(view.id);
  });

  test('moveViewToElement removes view from any folder and sets centerElementId', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({ name: 'V', viewpointId: 'layered' });
    model.views[view.id] = view;
    model.folders[rootId] = { ...model.folders[rootId], viewIds: [view.id] };

    moveViewToElement(model, view.id, el.id);

    expect(model.views[view.id].centerElementId).toBe(el.id);
    expect(model.folders[rootId].viewIds).not.toContain(view.id);
  });

  test('deleteFolder default mode moves contents to parent and reparents child folders', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const randSpy = jest.spyOn(Math, 'random');
    randSpy.mockReturnValueOnce(0.444444444);
    const folderA = createFolder(model, rootId, 'A');
    randSpy.mockReturnValueOnce(0.555555555);
    const folderB = createFolder(model, folderA, 'B');
    randSpy.mockRestore();

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({ name: 'V', viewpointId: 'layered' });
    model.views[view.id] = view;

    model.folders[folderA] = { ...model.folders[folderA], elementIds: [el.id], viewIds: [view.id] };

    deleteFolder(model, folderA);

    // Folder A removed.
    expect(model.folders[folderA]).toBeUndefined();

    // Contents moved to root.
    expect(model.folders[rootId].elementIds).toContain(el.id);
    expect(model.folders[rootId].viewIds).toContain(view.id);

    // Child folder reparented to root.
    expect(model.folders[rootId].folderIds).toContain(folderB);
    expect(model.folders[folderB].parentId).toBe(rootId);
  });

  test('deleteFolder deleteContents removes subtree folders and contained elements/views', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    const randSpy = jest.spyOn(Math, 'random');
    randSpy.mockReturnValueOnce(0.666666666);
    const folderA = createFolder(model, rootId, 'A');
    randSpy.mockReturnValueOnce(0.777777777);
    const folderB = createFolder(model, folderA, 'B');
    randSpy.mockRestore();

    const el = createElement({ name: 'E', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;
    model.folders[folderB] = { ...model.folders[folderB], elementIds: [el.id] };

    const view = createView({ name: 'V', viewpointId: 'layered' });
    model.views[view.id] = view;
    model.folders[folderA] = { ...model.folders[folderA], viewIds: [view.id] };

    deleteFolder(model, folderA, { mode: 'deleteContents' });

    expect(model.folders[folderA]).toBeUndefined();
    expect(model.folders[folderB]).toBeUndefined();
    expect(model.folders[rootId].folderIds).not.toContain(folderA);

    expect(model.elements[el.id]).toBeUndefined();
    expect(model.views[view.id]).toBeUndefined();
  });

  test('renameFolder throws for root folder', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = getRootFolderId(model);

    expect(() => renameFolder(model, rootId, 'New')).toThrow(/root folder/i);
  });
});
