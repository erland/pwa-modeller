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
});
