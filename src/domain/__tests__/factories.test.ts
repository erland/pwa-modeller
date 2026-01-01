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

  test('createEmptyModel creates a single root folder (v2+)', () => {
    const model = createEmptyModel({ name: 'Test Model' });
    const folders = Object.values(model.folders);
    const root = folders.find((f) => f.kind === 'root');

    expect(root).toBeTruthy();
    expect(folders).toHaveLength(1);

    // Root starts empty and can hold both elements and views.
    expect(root!.folderIds).toEqual([]);
    expect(root!.elementIds).toEqual([]);
    expect(root!.viewIds).toEqual([]);

    expect(model.schemaVersion).toBe(2);
  });
});
