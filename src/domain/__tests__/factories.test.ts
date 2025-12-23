import { createElement, createRelationship, createEmptyModel } from '../factories';

describe('domain factories', () => {
  test('createElement creates an element with generated id and trimmed fields', () => {
    const el = createElement({
      name: '  My Actor  ',
      layer: 'Business',
      type: 'BusinessActor',
      description: '  desc  ',
      documentation: '  docs  '
    });

    expect(el.id).toMatch(/^el_/);
    expect(el.name).toBe('My Actor');
    expect(el.description).toBe('desc');
    expect(el.documentation).toBe('docs');
  });

  test('createElement enforces non-empty name', () => {
    expect(() =>
      createElement({
        name: '   ',
        layer: 'Business',
        type: 'BusinessActor'
      })
    ).toThrow(/Element\.name/);
  });

  test('createRelationship creates a relationship with generated id', () => {
    const rel = createRelationship({
      sourceElementId: 'el_1',
      targetElementId: 'el_2',
      type: 'Association',
      name: '  relates  '
    });

    expect(rel.id).toMatch(/^rel_/);
    expect(rel.name).toBe('relates');
  });

  test('createEmptyModel creates root + elements/views folders', () => {
    const model = createEmptyModel({ name: 'Test Model' });
    const folders = Object.values(model.folders);
    const root = folders.find(f => f.kind === 'root');
    const elements = folders.find(f => f.kind === 'elements');
    const views = folders.find(f => f.kind === 'views');

    expect(root).toBeTruthy();
    expect(elements).toBeTruthy();
    expect(views).toBeTruthy();

    // Root should reference its children.
    expect(root!.folderIds).toEqual(expect.arrayContaining([elements!.id, views!.id]));
  });
});
