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

  test('createElement defaults UML class/interface/datatype attrs to empty member arrays', () => {
    const c = createElement({ name: 'C', type: 'uml.class' as any });
    expect(c.kind).toBe('uml');
    expect(c.attrs).toEqual({ attributes: [], operations: [] });

    const i = createElement({ name: 'I', type: 'uml.interface' as any });
    expect(i.kind).toBe('uml');
    expect(i.attrs).toEqual({ attributes: [], operations: [] });

    const d = createElement({ name: 'D', type: 'uml.datatype' as any });
    expect(d.kind).toBe('uml');
    expect(d.attrs).toEqual({ attributes: [], operations: [] });

    const a = createElement({ name: 'Actor', layer: 'Business', type: 'BusinessActor' });
    expect(a.kind ?? 'archimate').toBe('archimate');
    expect(a.attrs).toBeUndefined();
  });




  test('createElement defaults BPMN semantic attrs for common types', () => {
    const g = createElement({ name: 'G', type: 'bpmn.gatewayExclusive' as any });
    expect(g.kind).toBe('bpmn');
    expect(g.attrs).toEqual({ gatewayKind: 'exclusive' });

    const t = createElement({ name: 'T', type: 'bpmn.task' as any });
    expect(t.attrs).toEqual({ loopType: 'none' });

    const b = createElement({ name: 'B', type: 'bpmn.boundaryEvent' as any });
    expect(b.attrs).toEqual({ eventKind: 'boundary', eventDefinition: { kind: 'none' }, cancelActivity: true });

    const c = createElement({ name: 'Call', type: 'bpmn.callActivity' as any });
    expect(c.attrs).toEqual({ loopType: 'none', isCall: true });
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

  test('createRelationship defaults UML association-like attrs to a stable end-metadata shape', () => {
    const rel = createRelationship({
      sourceElementId: 'el_1',
      targetElementId: 'el_2',
      type: 'uml.association' as any,
    });

    expect(rel.kind).toBe('uml');
    expect(rel.attrs).toEqual({
      sourceRole: undefined,
      targetRole: undefined,
      sourceMultiplicity: undefined,
      targetMultiplicity: undefined,
      sourceNavigable: undefined,
      targetNavigable: undefined,
      stereotype: undefined,
    });
  });

  test('createRelationship uses documentation (and falls back to legacy description)', () => {
    const rel = createRelationship({
      sourceElementId: 'el_1',
      targetElementId: 'el_2',
      type: 'Serving',
      documentation: '  docs  ',
      // legacy field should be ignored when documentation exists
      description: '  legacy  '
    } as any);

    expect(rel.documentation).toBe('docs');

    const relLegacy = createRelationship({
      sourceElementId: 'el_1',
      targetElementId: 'el_2',
      type: 'Serving',
      description: '  legacy  '
    } as any);

    expect(relLegacy.documentation).toBe('legacy');
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

    expect(model.schemaVersion).toBe(10);
  });
});
