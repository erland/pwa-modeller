import { createConnector, createEmptyModel, createElement } from '../factories';
import { validateElement, validateModelIdsUnique } from '../validation';

describe('domain validation', () => {
  test('validateElement catches missing name', () => {
    const bad = {
      id: 'el_x',
      name: '   ',
      layer: 'Business',
      type: 'BusinessActor'
    } as unknown as Parameters<typeof validateElement>[0];

    const res = validateElement(bad);
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(expect.arrayContaining(['Element.name must be non-empty']));
  });

  test('validateModelIdsUnique detects duplicates across collections', () => {
    const model = createEmptyModel({ name: 'Dupes' }, 'same');

    // Insert an element with an id that duplicates the model id.
    model.elements['same'] = createElement({
      id: 'same',
      name: 'X',
      layer: 'Business',
      type: 'BusinessActor'
    });

    const res = validateModelIdsUnique(model);
    expect(res.ok).toBe(false);
    expect(res.duplicates).toEqual(expect.arrayContaining(['same']));
  });

  test('validateModelIdsUnique includes connectors in duplicate detection', () => {
    const model = createEmptyModel({ name: 'Dupes' }, 'same');
    model.connectors['same'] = createConnector({ id: 'same', type: 'AndJunction' });

    const res = validateModelIdsUnique(model);
    expect(res.ok).toBe(false);
    expect(res.duplicates).toEqual(expect.arrayContaining(['same']));
  });
});
