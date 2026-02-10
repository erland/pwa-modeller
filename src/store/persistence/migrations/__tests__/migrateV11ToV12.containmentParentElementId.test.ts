import { createElement, createEmptyModel } from '../../../../domain';
import { migrateModel } from '../index';

describe('migrations v11 -> v12 (containment parentElementId)', () => {
  test('bumps schemaVersion and normalizes parentElementId if present', () => {
    const model: any = createEmptyModel({ name: 'Legacy v11 containment' });
    model.schemaVersion = 11;

    // ArchiMate elements require a layer in the domain factory.
    const parent = createElement({ name: 'Parent', type: 'archimate.business-actor', layer: 'business' }) as any;
    const child1 = createElement({ name: 'Child1', type: 'archimate.business-role', layer: 'business' }) as any;
    child1.parentElementId = `  ${parent.id}  `;
    const child2 = createElement({ name: 'Child2', type: 'archimate.business-role', layer: 'business' }) as any;
    child2.parentElementId = '';
    const child3 = createElement({ name: 'Child3', type: 'archimate.business-role', layer: 'business' }) as any;
    child3.parentElementId = null;

    model.elements[parent.id] = parent;
    model.elements[child1.id] = child1;
    model.elements[child2.id] = child2;
    model.elements[child3.id] = child3;

    const migrated: any = migrateModel(model);
    expect(migrated.schemaVersion).toBe(12);
    expect(migrated.elements[child1.id].parentElementId).toBe(parent.id);
    expect('parentElementId' in migrated.elements[child2.id]).toBe(false);
    expect('parentElementId' in migrated.elements[child3.id]).toBe(false);
  });
});
