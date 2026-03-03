import { createElement, createView } from '../../domain/factories';
import { createModelStore } from '../modelStore';

describe('ModelStore (contract)', () => {
  test('element CRUD roundtrip keeps state consistent', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'Contract' });

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    store.addElement(el);
    expect(store.getState().model?.elements[el.id]).toMatchObject({ id: el.id, name: 'A' });

    store.updateElement(el.id, { name: 'A2' });
    expect(store.getState().model?.elements[el.id].name).toBe('A2');

    store.deleteElement(el.id);
    expect(store.getState().model?.elements[el.id]).toBeUndefined();
  });

  test('a basic view operation (create view object at cursor) is stable', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'Contract' });

    const view = createView({ name: 'Main', viewpointId: 'layered' });
    store.addView(view);

    const objectId = store.createViewObjectInViewAt(view.id, 'Note', 100, 200);

    const st = store.getState();
    const persistedView = st.model?.views[view.id];
    expect(persistedView).toBeTruthy();
    expect(persistedView?.objects?.[objectId]).toMatchObject({ id: objectId, type: 'Note' });
  });

  test('dataset switch via hydrate updates activeDatasetId without mutating the model snapshot', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'Contract' });

    const st1 = store.getState();
    const model1 = st1.model;
    expect(model1).toBeTruthy();

    store.hydrate({
      model: model1!,
      fileName: st1.fileName,
      isDirty: st1.isDirty,
      activeDatasetId: 'local:contract-ds-1'
    });

    const st2 = store.getState();
    expect(st2.activeDatasetId).toBe('local:contract-ds-1');
    // Should preserve the exact model object we passed in (no hidden cloning on dataset switch).
    expect(st2.model).toBe(model1);

    store.hydrate({
      model: model1!,
      fileName: st1.fileName,
      isDirty: st1.isDirty,
      activeDatasetId: 'local:contract-ds-2'
    });

    const st3 = store.getState();
    expect(st3.activeDatasetId).toBe('local:contract-ds-2');
    expect(st3.model).toBe(model1);
  });
});
