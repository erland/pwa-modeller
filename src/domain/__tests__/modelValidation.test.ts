import { createElement, createEmptyModel, createRelationship } from '../factories';
import { validateModel } from '../modelValidation';

describe('validateModel', () => {
  it('reports relationships that reference missing elements', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'Service', layer: 'Business', type: 'BusinessService' });
    model.elements[el.id] = el;

    const rel = createRelationship({
      type: 'Serving',
      sourceElementId: 'missing_source',
      targetElementId: el.id
    });
    model.relationships[rel.id] = rel;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('missing source element'))).toBe(true);
  });

  it('reports invalid ArchiMate structural combinations', () => {
    const model = createEmptyModel({ name: 'M' });
    const actor = createElement({ name: 'Actor', layer: 'Business', type: 'BusinessActor' });
    const service = createElement({ name: 'Service', layer: 'Business', type: 'BusinessService' });
    model.elements[actor.id] = actor;
    model.elements[service.id] = service;

    // Invalid: Serving must originate from a Service.
    const rel = createRelationship({
      type: 'Serving',
      sourceElementId: actor.id,
      targetElementId: service.id
    });
    model.relationships[rel.id] = rel;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('Serving relationships must originate from a Service'))).toBe(true);
  });

  it('reports duplicate IDs across collections', () => {
    const model = createEmptyModel({ name: 'M' });
    // Force an element to share the model id (cross-collection duplicate).
    const el = createElement({ id: model.id, name: 'Dup', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes(`Duplicate id detected in model: ${model.id}`))).toBe(true);
  });
});
