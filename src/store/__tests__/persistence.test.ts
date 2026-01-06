import { createEmptyModel, createElement, createRelationship, createView } from '../../domain/factories';
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

    expect(parsed.schemaVersion).toBe(3);

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

});
