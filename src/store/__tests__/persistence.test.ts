import {
  createConnector,
  createEmptyModel,
  createElement,
  createRelationship,
  createView,
  createViewObject,
  createViewObjectNodeLayout
} from '../../domain/factories';
import { deserializeModel, serializeModel } from '../persistence';
import { stripUndefinedDeep } from '../../test/stripUndefinedDeep';

describe('persistence', () => {
  test('serializeModel + deserializeModel round-trip yields equivalent model', () => {
    const model = createEmptyModel({ name: 'Test Model', description: 'desc' });

    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    const b = createElement({ name: 'B', layer: 'Application', type: 'ApplicationComponent', documentation: 'docs' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({ sourceElementId: a.id, targetElementId: b.id, type: 'Serving' });
    model.relationships[rel.id] = rel;

    const view = createView({ name: 'Main', viewpointId: 'layered' });
    model.views[view.id] = view;

    const json = serializeModel(model);
    const parsed = deserializeModel(json);

    expect(stripUndefinedDeep(parsed)).toEqual(stripUndefinedDeep(model));
  });

  test('serializeModel + deserializeModel round-trip preserves connectors and connector endpoints', () => {
    const model = createEmptyModel({ name: 'Connectors', description: 'desc' });

    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    const b = createElement({ name: 'B', layer: 'Application', type: 'ApplicationComponent' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const and = createConnector({ type: 'AndJunction' });
    model.connectors[and.id] = and;

    const r1 = createRelationship({ sourceElementId: a.id, targetConnectorId: and.id, type: 'Flow' });
    const r2 = createRelationship({ sourceConnectorId: and.id, targetElementId: b.id, type: 'Flow' });
    model.relationships[r1.id] = r1;
    model.relationships[r2.id] = r2;

    const view = createView({
      name: 'Main',
      viewpointId: 'layered',
      layout: {
        nodes: [
          { elementId: a.id, x: 0, y: 0, width: 120, height: 70, zIndex: 0 },
          { connectorId: and.id, x: 200, y: 20, width: 20, height: 20, zIndex: 1 },
          { elementId: b.id, x: 300, y: 0, width: 120, height: 70, zIndex: 2 }
        ],
        relationships: [
          { relationshipId: r1.id, points: [], zIndex: 0 },
          { relationshipId: r2.id, points: [], zIndex: 1 }
        ]
      }
    });
    model.views[view.id] = view;

    const parsed = deserializeModel(serializeModel(model));
    expect(stripUndefinedDeep(parsed)).toEqual(stripUndefinedDeep(model));
  });

  test('serializeModel + deserializeModel round-trip preserves view objects and their layout nodes', () => {
    const model = createEmptyModel({ name: 'View Objects', description: 'desc' });

    const note = createViewObject({ type: 'Note', text: 'Hello note' });
    const label = createViewObject({ type: 'Label', text: 'Title' });
    const group = createViewObject({ type: 'GroupBox', name: 'Scope' });

    const view = createView({
      name: 'Main',
      viewpointId: 'layered',
      objects: {
        [note.id]: note,
        [label.id]: label,
        [group.id]: group
      },
      layout: {
        nodes: [
          createViewObjectNodeLayout(group.id, 0, 0, 400, 240, -100),
          createViewObjectNodeLayout(note.id, 40, 40, 220, 140, 0),
          createViewObjectNodeLayout(label.id, 60, 10, 160, 36, 1)
        ],
        relationships: []
      }
    });
    model.views[view.id] = view;

    const parsed = deserializeModel(serializeModel(model));
    expect(stripUndefinedDeep(parsed)).toEqual(stripUndefinedDeep(model));
  });

  test('serializeModel + deserializeModel round-trip preserves view objects and object node layouts', () => {
    const model = createEmptyModel({ name: 'ViewObjects', description: 'desc' });

    const note = createViewObject({ type: 'Note', text: 'Hello note' });
    const label = createViewObject({ type: 'Label', text: 'Header' });
    const group = createViewObject({ type: 'GroupBox', name: 'Scope' });

    const view = createView({
      name: 'Main',
      viewpointId: 'layered',
      objects: {
        [note.id]: note,
        [label.id]: label,
        [group.id]: group
      },
      layout: {
        nodes: [
          { ...createViewObjectNodeLayout(group.id, 0, 0, 400, 260, 0) },
          { ...createViewObjectNodeLayout(label.id, 20, 20, 200, 36, 1) },
          { ...createViewObjectNodeLayout(note.id, 30, 80, 220, 140, 2) }
        ],
        relationships: []
      }
    });
    model.views[view.id] = view;

    const parsed = deserializeModel(serializeModel(model));
    expect(stripUndefinedDeep(parsed)).toEqual(stripUndefinedDeep(model));
  });

  test('deserializeModel migrates v4 models by adding connectors container', () => {
    const modelV4 = createEmptyModel({ name: 'Legacy v4' }) as any;
    // Force a v4-like shape: remove connectors and downgrade schemaVersion.
    delete modelV4.connectors;
    modelV4.schemaVersion = 4;

    const parsed = deserializeModel(serializeModel(modelV4));
    expect(parsed.schemaVersion).toBe(8);
    expect(parsed.connectors).toEqual({});
  });

  test('deserializeModel migrates v5 models by adding view.objects containers', () => {
    const modelV5 = createEmptyModel({ name: 'Legacy v5' }) as any;
    modelV5.schemaVersion = 5;

    const view = createView({ name: 'Main', viewpointId: 'layered' }) as any;
    delete view.objects;
    modelV5.views[view.id] = view;

    const parsed = deserializeModel(serializeModel(modelV5));
    expect(parsed.schemaVersion).toBe(8);
    expect((parsed.views[view.id] as any).objects).toEqual({});
  });

  test('deserializeModel migrates v6 models by moving legacy description to documentation (concept objects)', () => {
    const modelV6 = createEmptyModel({ name: 'Legacy v6' }) as any;
    modelV6.schemaVersion = 6;

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' }) as any;
    // Simulate legacy persisted shape
    el.description = 'Legacy element desc';
    delete el.documentation;
    modelV6.elements[el.id] = el;

    const rel = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Serving' }) as any;
    rel.description = 'Legacy relationship desc';
    delete rel.documentation;
    modelV6.relationships[rel.id] = rel;

    const view = createView({ name: 'Main', viewpointId: 'layered' }) as any;
    view.description = 'Legacy view desc';
    delete view.documentation;
    modelV6.views[view.id] = view;

    const conn = createConnector({ type: 'AndJunction' }) as any;
    conn.description = 'Legacy connector desc';
    delete conn.documentation;
    modelV6.connectors[conn.id] = conn;

    const parsed = deserializeModel(serializeModel(modelV6));
    expect(parsed.schemaVersion).toBe(8);

    const parsedEl: any = parsed.elements[el.id];
    expect(parsedEl.documentation).toBe('Legacy element desc');
    expect('description' in parsedEl).toBe(false);

    const parsedRel: any = parsed.relationships[rel.id];
    expect(parsedRel.documentation).toBe('Legacy relationship desc');
    expect('description' in parsedRel).toBe(false);

    const parsedView: any = parsed.views[view.id];
    expect(parsedView.documentation).toBe('Legacy view desc');
    expect('description' in parsedView).toBe(false);

    const parsedConn: any = (parsed as any).connectors[conn.id];
    expect(parsedConn.documentation).toBe('Legacy connector desc');
    expect('description' in parsedConn).toBe(false);
  });

  test('deserializeModel migrates v1 models by removing legacy Elements/Views root folders', () => {
    // Minimal v1-like model structure (as produced by older createEmptyModel()).
    const modelV1 = createEmptyModel({ name: 'Legacy' }) as any;

    // Force it into the legacy shape (createEmptyModel is v2+ in current code).
    const rootFolderId = Object.values(modelV1.folders).find((f: any) => f.kind === 'root')!.id;

    const elementsFolderId = 'folder_elements';
    const viewsFolderId = 'folder_views';

    modelV1.folders[elementsFolderId] = {
      id: elementsFolderId,
      name: 'Elements',
      kind: 'elements',
      parentId: rootFolderId,
      folderIds: [],
      elementIds: [],
      viewIds: []
    };
    modelV1.folders[viewsFolderId] = {
      id: viewsFolderId,
      name: 'Views',
      kind: 'views',
      parentId: rootFolderId,
      folderIds: [],
      elementIds: [],
      viewIds: []
    };

    modelV1.folders[rootFolderId] = {
      ...modelV1.folders[rootFolderId],
      folderIds: [elementsFolderId, viewsFolderId]
    };

    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    const view = createView({ name: 'Main', viewpointId: 'layered' });

    modelV1.elements[a.id] = a;
    modelV1.views[view.id] = view;

    modelV1.folders[elementsFolderId].elementIds.push(a.id);
    modelV1.folders[viewsFolderId].viewIds.push(view.id);

    modelV1.schemaVersion = 1;

    const parsed = deserializeModel(serializeModel(modelV1));

    expect(parsed.schemaVersion).toBe(8);

    const folders = Object.values(parsed.folders);
    expect(folders.find((f) => f.kind === 'elements')).toBeUndefined();
    expect(folders.find((f) => f.kind === 'views')).toBeUndefined();

    const root = folders.find((f) => f.kind === 'root');
    expect(root).toBeTruthy();
    expect(root!.elementIds).toContain(a.id);
    expect(root!.viewIds).toContain(view.id);
  });

  test('deserializeModel sanitizes taggedValues on load', () => {
    const model = createEmptyModel({ name: 'Tagged Model', description: 'desc' });

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' }) as any;
    el.taggedValues = [
      { id: '  ', ns: '  xmi ', key: '  foo  ', type: 'boolean', value: 'TRUE' },
      { id: 'id2', ns: 'xmi', key: 'foo', type: 'boolean', value: 'false' }, // duplicate (ns,key) - keep last
      { id: 'id3', key: '   ', value: 'x' }, // invalid key - dropped
      { id: 'id4', key: 'bar', type: 'json', value: '{ "a": 1 }' },
      { id: 'id5', key: 'baz', type: 'number', value: ' 12 ' },
    ];
    model.elements[el.id] = el;

    const rel = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Serving' }) as any;
    rel.taggedValues = { not: 'an array' };
    model.relationships[rel.id] = rel;

    const view = createView({ name: 'V1', viewpointId: 'layered' }) as any;
    view.taggedValues = [{ id: 'v1', key: ' ', value: 'nope' }]; // becomes undefined
    model.views[view.id] = view;

    const json = serializeModel(model);
    const parsed = deserializeModel(json);

    const parsedEl: any = parsed.elements[el.id];
    expect(Array.isArray(parsedEl.taggedValues)).toBe(true);
    expect(parsedEl.taggedValues.length).toBe(3);

    // (xmi, foo) kept last entry, canonicalized
    const foo = parsedEl.taggedValues.find((t: any) => t.ns === 'xmi' && t.key === 'foo');
    expect(foo).toBeTruthy();
    expect(foo.id).toBe('id2');
    expect(foo.value).toBe('false');

    const bar = parsedEl.taggedValues.find((t: any) => t.key === 'bar');
    expect(bar.type).toBe('json');
    expect(bar.value).toBe('{"a":1}');

    const baz = parsedEl.taggedValues.find((t: any) => t.key === 'baz');
    expect(baz.type).toBe('number');
    expect(baz.value).toBe('12');

    const parsedRel: any = parsed.relationships[rel.id];
    expect(parsedRel.taggedValues).toBeUndefined();

    const parsedView: any = parsed.views[view.id];
    expect(parsedView.taggedValues).toBeUndefined();
  });

  test('deserializeModel sanitizes relationship attrs on load', () => {
    const model = createEmptyModel({ name: 'RelAttrs Model', description: 'desc' });

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const access = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Access' }) as any;
    access.attrs = {
      accessType: 'Read',
      // should be dropped because not relevant for Access
      isDirected: true,
      influenceStrength: '++',
    };
    model.relationships[access.id] = access;

    const assoc = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Association' }) as any;
    // invalid type (string), should be dropped
    assoc.attrs = { isDirected: 'true' };
    model.relationships[assoc.id] = assoc;

    const infl = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Influence' }) as any;
    infl.attrs = { influenceStrength: '  --  ' };
    model.relationships[infl.id] = infl;

    const other = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Serving' }) as any;
    // attrs not supported for this relationship type
    other.attrs = { accessType: 'Write' };
    model.relationships[other.id] = other;

    const parsed = deserializeModel(serializeModel(model));

    expect((parsed.relationships as any)[access.id].attrs).toEqual({ accessType: 'Read' });
    expect((parsed.relationships as any)[assoc.id].attrs).toBeUndefined();
    expect((parsed.relationships as any)[infl.id].attrs).toEqual({ influenceStrength: '--' });
    expect((parsed.relationships as any)[other.id].attrs).toBeUndefined();
  });

  test('deserializeModel sanitizes unknown types on load', () => {
    const model = createEmptyModel({ name: 'UnknownTypes Model', description: 'desc' });

    // Element: type Unknown with messy unknownType
    const el = createElement({ name: 'Mystery', layer: 'Business', type: 'BusinessActor' }) as any;
    el.type = 'Unknown';
    el.unknownType = { ns: '  xmi  ', name: '  SomeVendorType  ' };
    model.elements[el.id] = el;

    // Element: known type but has unknownType set (should be cleared)
    const knownEl = createElement({ name: 'Known', layer: 'Business', type: 'BusinessRole' }) as any;
    knownEl.unknownType = { ns: 'x', name: 'ShouldDisappear' };
    model.elements[knownEl.id] = knownEl;

    // Relationship: Unknown type with missing/blank name -> normalized to "Unknown"
    const rel = createRelationship({ sourceElementId: el.id, targetElementId: knownEl.id, type: 'Serving' }) as any;
    rel.type = 'Unknown';
    rel.unknownType = { ns: '  ', name: '   ' };
    model.relationships[rel.id] = rel;

    // Relationship: known type but has unknownType set (should be cleared)
    const knownRel = createRelationship({ sourceElementId: el.id, targetElementId: knownEl.id, type: 'Serving' }) as any;
    knownRel.unknownType = { ns: 'x', name: 'Nope' };
    model.relationships[knownRel.id] = knownRel;

    const parsed = deserializeModel(serializeModel(model));

    const parsedEl: any = parsed.elements[el.id];
    expect(parsedEl.type).toBe('Unknown');
    expect(parsedEl.unknownType).toEqual({ ns: 'xmi', name: 'SomeVendorType' });

    const parsedKnownEl: any = parsed.elements[knownEl.id];
    expect(parsedKnownEl.type).toBe('BusinessRole');
    expect(parsedKnownEl.unknownType).toBeUndefined();

    const parsedRel: any = parsed.relationships[rel.id];
    expect(parsedRel.type).toBe('Unknown');
    expect(parsedRel.unknownType).toEqual({ name: 'Unknown' });

    const parsedKnownRel: any = parsed.relationships[knownRel.id];
    expect(parsedKnownRel.type).toBe('Serving');
    expect(parsedKnownRel.unknownType).toBeUndefined();
  });

  test('deserializeModel sanitizes externalIds on load', () => {
    const model = createEmptyModel({ name: 'ExternalIds Model', description: 'desc' });

    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' }) as any;
    el.externalIds = [
      { system: '  archimate-exchange  ', id: '  1  ', scope: '   ' },
      { system: 'archimate-exchange', id: '1' }, // duplicate -> keep last
      { system: 'ea-xmi', id: '  EAID_1  ', scope: '  modelA  ' },
      { system: '', id: 'x' }, // invalid -> dropped
    ];
    model.elements[el.id] = el;

    const rel = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Serving' }) as any;
    rel.externalIds = { not: 'an array' };
    model.relationships[rel.id] = rel;

    const view = createView({ name: 'V1', viewpointId: 'layered' }) as any;
    view.externalIds = [
      { system: 'archimate-exchange', id: 'v1', scope: '' },
      { system: 'archimate-exchange', id: 'v1' }, // duplicate -> keep last
    ];
    model.views[view.id] = view;

    const parsed = deserializeModel(serializeModel(model));

    const parsedEl: any = parsed.elements[el.id];
    expect(parsedEl.externalIds).toEqual([
      { system: 'archimate-exchange', id: '1' },
      { system: 'ea-xmi', id: 'EAID_1', scope: 'modelA' },
    ]);

    const parsedRel: any = parsed.relationships[rel.id];
    expect(parsedRel.externalIds).toBeUndefined();

    const parsedView: any = parsed.views[view.id];
    expect(parsedView.externalIds).toEqual([{ system: 'archimate-exchange', id: 'v1' }]);
  });

  test('deserializeModel sanitizes model + folder taggedValues/externalIds on load', () => {
    const model = createEmptyModel({ name: 'Extensions Model', description: 'desc' }) as any;

    model.externalIds = [
      { system: '  ea-xmi  ', id: '  EAID_ROOT  ', scope: '   ' },
      { system: 'ea-xmi', id: 'EAID_ROOT' }, // duplicate -> keep last
      { system: '', id: 'x' } // invalid -> dropped
    ];
    model.taggedValues = [
      { id: 't1', ns: '  xmi ', key: '  foo  ', type: 'boolean', value: 'TRUE' },
      { id: 't2', ns: 'xmi', key: 'foo', type: 'boolean', value: 'false' } // duplicate (ns,key) -> keep last
    ];

    const rootId = Object.values(model.folders).find((f: any) => f.kind === 'root')!.id;
    model.folders[rootId].externalIds = [
      { system: '  archimate-exchange ', id: '  pkg1  ', scope: '  modelA  ' },
      { system: 'archimate-exchange', id: 'pkg1', scope: 'modelA' }
    ];
    model.folders[rootId].taggedValues = [
      { id: 'f1', key: '  color  ', value: ' blue ' },
      { id: 'f2', key: 'color', value: 'red' } // duplicate -> keep last
    ];

    const parsed = deserializeModel(serializeModel(model));

    expect(parsed.externalIds).toEqual([{ system: 'ea-xmi', id: 'EAID_ROOT' }]);
    expect(parsed.taggedValues.find((t: any) => t.ns === 'xmi' && t.key === 'foo')?.id).toBe('t2');
    expect(parsed.taggedValues.find((t: any) => t.ns === 'xmi' && t.key === 'foo')?.value).toBe('false');

    const parsedRoot: any = parsed.folders[rootId];
    expect(parsedRoot.externalIds).toEqual([{ system: 'archimate-exchange', id: 'pkg1', scope: 'modelA' }]);
    expect(parsedRoot.taggedValues.find((t: any) => t.key === 'color')?.id).toBe('f2');
    expect(parsedRoot.taggedValues.find((t: any) => t.key === 'color')?.value).toBe('red');
  });

});
