import { createElement, createRelationship, createView } from '../../domain/factories';
import { createModelStore } from '../modelStore';

describe('ModelStore', () => {
  test('can create a model and update metadata', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const st1 = store.getState();
    expect(st1.model?.metadata.name).toBe('My Model');

    store.updateModelMetadata({ description: 'Hello' });
    const st2 = store.getState();
    expect(st2.model?.metadata.description).toBe('Hello');
  });

  test('add/update/delete elements', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    store.addElement(el);

    expect(store.getState().model?.elements[el.id].name).toBe('A');

    store.updateElement(el.id, { name: 'A2' });
    expect(store.getState().model?.elements[el.id].name).toBe('A2');

    store.deleteElement(el.id);
    expect(store.getState().model?.elements[el.id]).toBeUndefined();
  });

  test('deleting an element removes relationships that reference it', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    const b = createElement({ name: 'B', layer: 'Application', type: 'ApplicationComponent' });
    store.addElement(a);
    store.addElement(b);

    const rel = createRelationship({ sourceElementId: a.id, targetElementId: b.id, type: 'Serving' });
    store.addRelationship(rel);

    expect(store.getState().model?.relationships[rel.id]).toBeTruthy();
    store.deleteElement(a.id);
    expect(store.getState().model?.relationships[rel.id]).toBeUndefined();
  });

  test('add/update/delete views', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const view = createView({ name: 'Main', viewpointId: 'layered' });
    store.addView(view);
    expect(store.getState().model?.views[view.id].name).toBe('Main');

    store.updateView(view.id, { name: 'Main2' });
    expect(store.getState().model?.views[view.id].name).toBe('Main2');

    store.deleteView(view.id);
    expect(store.getState().model?.views[view.id]).toBeUndefined();
  });

  test('updateModel clones model-level externalIds and taggedValues arrays', () => {
    const store = createModelStore();
    store.createEmptyModel({ name: 'My Model' });

    const m1 = store.getState().model!;
    expect(m1.externalIds).toBeDefined();
    expect(m1.taggedValues).toBeDefined();
    const ext1 = m1.externalIds as any;
    const tv1 = m1.taggedValues as any;

    store.updateModelMetadata({ description: 'Hello' });

    const m2 = store.getState().model!;
    expect(m2.externalIds).not.toBe(ext1);
    expect(m2.taggedValues).not.toBe(tv1);
    expect(m2.externalIds).toEqual(ext1);
    expect(m2.taggedValues).toEqual(tv1);
  });
});