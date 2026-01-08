import { createConnector, createElement, createRelationship, createEmptyModel } from '../factories';

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

  test('createRelationship supports connector endpoints', () => {
    const rel = createRelationship({
      sourceConnectorId: 'conn_1',
      targetElementId: 'el_2',
      type: 'Flow'
    });

    expect(rel.id).toMatch(/^rel_/);
    expect(rel.sourceConnectorId).toBe('conn_1');
    expect(rel.targetElementId).toBe('el_2');
  });

  test('createRelationship enforces that endpoints are present', () => {
    expect(() =>
      createRelationship({
        // no endpoints
        type: 'Association'
      } as any)
    ).toThrow(/source endpoint is required/i);

    expect(() =>
      createRelationship({
        sourceElementId: 'el_1',
        // missing target
        type: 'Association'
      } as any)
    ).toThrow(/target endpoint is required/i);
  });

  test('createConnector creates a connector with generated id and trimmed fields', () => {
    const c = createConnector({
      type: 'AndJunction',
      name: '  AND  ',
      documentation: '  docs  '
    });

    expect(c.id).toMatch(/^conn_/);
    expect(c.type).toBe('AndJunction');
    expect(c.name).toBe('AND');
    expect(c.documentation).toBe('docs');
    expect(c.externalIds).toEqual([]);
    expect(c.taggedValues).toEqual([]);
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
    expect((root as any)!.relationshipIds).toEqual([]);

    // v4+: root folder supports external IDs + tagged values (default empty arrays)
    expect((root as any)!.externalIds).toEqual([]);
    expect((root as any)!.taggedValues).toEqual([]);

    // v4+: model supports external IDs + tagged values (default empty arrays)
    expect((model as any).externalIds).toEqual([]);
    expect((model as any).taggedValues).toEqual([]);

    expect(model.schemaVersion).toBe(7);
  });
});
