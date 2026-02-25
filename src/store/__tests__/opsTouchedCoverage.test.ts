import { createElement, createView } from '../../domain/factories';
import { findFolderIdByKind } from '../mutations/helpers';
import { createModelStore } from '../modelStore';

/**
 * Smoke tests ensuring that mutating ops/modules always report touched ids.
 *
 * These tests are intentionally lightweight: they don't try to validate full behavior,
 * only that a change results in a deterministic ChangeSet containing the expected ids.
 */
describe('Ops touched coverage (smoke)', () => {
  test('element ops: moveElementToParent records touched element', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'M' });

    const parent = createElement({ name: 'Parent', layer: 'Business', type: 'BusinessActor' });
    const child = createElement({ name: 'Child', layer: 'Business', type: 'BusinessActor' });
    store.addElement(parent);
    store.addElement(child);

    store.consumeLastChangeSet(); // clear (from adds)

    store.moveElementToParent(child.id, parent.id);
    const cs = store.consumeLastChangeSet();
    expect(cs?.elementUpserts).toContain(child.id);
  });

  test('folder ops: createFolder records touched folder', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'M' });

    const rootId = findFolderIdByKind(store.getState().model!, 'root');
    store.consumeLastChangeSet();

    const folderId = store.createFolder(rootId, 'New Folder');
    const cs = store.consumeLastChangeSet();
    expect(cs?.folderUpserts).toContain(folderId);
  });

  test('view ops: addView records touched view', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'M' });

    store.consumeLastChangeSet();

    const view = createView({ name: 'Main', viewpointId: 'layered' });
    store.addView(view);
    const cs = store.consumeLastChangeSet();
    expect(cs?.viewUpserts).toContain(view.id);
  });

  test('layout ops: addElementToViewAt records touched view', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'M' });

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    store.addElement(el);
    const view = createView({ name: 'Main', viewpointId: 'layered' });
    store.addView(view);

    store.consumeLastChangeSet();

    store.addElementToViewAt(view.id, el.id, 10, 20);
    const cs = store.consumeLastChangeSet();
    expect(cs?.viewUpserts).toContain(view.id);
  });
});
