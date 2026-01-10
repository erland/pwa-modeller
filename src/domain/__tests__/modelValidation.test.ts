import { createConnector, createElement, createEmptyModel, createRelationship, createView } from '../factories';
import { initRelationshipValidationMatrixFromXml } from '../config/archimatePalette';

const fs = require('fs');
const path = require('path');
function readRelationshipTable(): string {
  const p = path.resolve(__dirname, '../validation/data/relationships.xml');
  return fs.readFileSync(p, 'utf-8');
}

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

  it('reports relationships that violate endpoint XOR invariants', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;
    const c = createConnector({ type: 'AndJunction' });
    model.connectors[c.id] = c;

    // Force an invalid relationship: both sourceElementId and sourceConnectorId are set.
    const rel = createRelationship({ sourceElementId: el.id, targetElementId: el.id, type: 'Association' }) as any;
    rel.sourceConnectorId = c.id;
    model.relationships[rel.id] = rel;

    const issues = validateModel(model);
    expect(
      issues.some((i) => i.message.includes('must have exactly one source endpoint'))
    ).toBe(true);
  });

  it('reports relationships that reference missing connectors', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const rel = createRelationship({ sourceConnectorId: 'missing_conn', targetElementId: el.id, type: 'Flow' });
    model.relationships[rel.id] = rel;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('missing source connector'))).toBe(true);
  });

  
it('supports full relationship-table validation modes', () => {
  initRelationshipValidationMatrixFromXml(readRelationshipTable());

  const model = createEmptyModel({ name: 'M' });
  const coa = createElement({ name: 'Handlingsalternativ', layer: 'Strategy', type: 'CourseOfAction' });
  const cap = createElement({ name: 'Förmåga', layer: 'Strategy', type: 'Capability' });
  model.elements[coa.id] = coa;
  model.elements[cap.id] = cap;

  // Serving is allowed in relationship tables for CourseOfAction -> Capability, but rejected by minimal rules.
  const rel = createRelationship({ type: 'Serving', sourceElementId: coa.id, targetElementId: cap.id });
  model.relationships[rel.id] = rel;

  const issuesMinimal = validateModel(model, 'minimal');
  expect(issuesMinimal.some((i) => i.message.includes('Serving relationships must originate from a Service'))).toBe(true);

  const issuesFull = validateModel(model, 'full');
  expect(issuesFull.some((i) => i.message.includes('Serving relationships must originate from a Service'))).toBe(false);
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

  it('reports invalid view node layout entries (elementId/connectorId XOR)', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;
    const c = createConnector({ type: 'OrJunction' });
    model.connectors[c.id] = c;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      layout: {
        nodes: [
          // Invalid: has BOTH ids
          { elementId: el.id, connectorId: c.id, x: 0, y: 0, w: 100, h: 60, zIndex: 0 } as any,
          // Invalid: has NEITHER id
          { x: 10, y: 10, w: 10, h: 10, zIndex: 1 } as any
        ],
        relationships: []
      }
    });
    model.views[view.id] = view;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('invalid node layout entry'))).toBe(true);
  });

  it('reports invalid view node layout entries involving view objects and missing view objects', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      objects: {
        obj_ok: { id: 'obj_ok', type: 'Note', text: 'Hello' }
      },
      layout: {
        nodes: [
          // Invalid: both elementId and objectId
          { elementId: el.id, objectId: 'obj_ok', x: 0, y: 0, width: 100, height: 60, zIndex: 0 } as any,
          // Warning: references missing object
          { objectId: 'obj_missing', x: 10, y: 10, width: 200, height: 100, zIndex: 1 }
        ],
        relationships: []
      }
    });
    model.views[view.id] = view;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('invalid node layout entry'))).toBe(true);
    expect(issues.some((i) => i.message.includes('missing view object'))).toBe(true);
  });

it('reports invalid externalIds/taggedValues on folders and model', () => {
  const model = createEmptyModel({ name: 'M' });

  // Add invalid entries
  (model as any).externalIds = [{ system: '', id: 'x' }, { system: 'ea-xmi', id: '1' }, { system: 'ea-xmi', id: '1' }];
  (model as any).taggedValues = [{ ns: 'x', key: '', type: 'string', value: 'v' }];

  const rootFolder = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!rootFolder) throw new Error('Missing root folder');

  (rootFolder as any).externalIds = [{ system: '', id: 'x' }, { system: 'ea-xmi', id: 'A' }, { system: 'ea-xmi', id: 'A' }];
  (rootFolder as any).taggedValues = [{ ns: 'x', key: '', type: 'string', value: 'v' }];

  const issues = validateModel(model);

  expect(issues.some((i) => i.message.includes('Model has') && i.message.includes('invalid external id'))).toBe(true);
  expect(issues.some((i) => i.message.includes('Model has') && i.message.includes('duplicate external ids'))).toBe(true);
  expect(issues.some((i) => i.message.includes('Model has') && i.message.includes('invalid tagged value'))).toBe(true);

  expect(issues.some((i) => i.message.includes('Folder') && i.message.includes('invalid external id'))).toBe(true);
  expect(issues.some((i) => i.message.includes('Folder') && i.message.includes('duplicate external ids'))).toBe(true);
  expect(issues.some((i) => i.message.includes('Folder') && i.message.includes('invalid tagged value'))).toBe(true);
});

});