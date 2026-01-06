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

});
