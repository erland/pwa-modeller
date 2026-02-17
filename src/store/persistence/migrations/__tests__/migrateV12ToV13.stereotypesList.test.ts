import { migrateModel } from '../index';

describe('migrations v12 -> v13 (stereotypes list)', () => {
  test('populates attrs.stereotypes from legacy attrs.stereotype for elements and relationships', () => {
    const model: any = {
      id: 'm1',
      schemaVersion: 12,
      metadata: { name: 'x' },
      folders: {},
      views: {},
      connectors: {},
      externalIds: [],
      taggedValues: [],
      elements: {
        e1: { id: 'e1', type: 'uml.class', name: 'C', attrs: { stereotype: 'Entity, Audited, entity ' } },
      },
      relationships: {
        r1: { id: 'r1', type: 'Association', sourceId: 'e1', targetId: 'e1', attrs: { stereotype: 'trace' } },
      },
    };

    const migrated: any = migrateModel(model);
    expect(migrated.schemaVersion).toBe(14);

    const e1 = migrated.elements.e1;
    expect(e1.attrs.stereotypes).toEqual(['Entity', 'Audited']);
    expect(e1.attrs.stereotype).toBeUndefined();

    const r1 = migrated.relationships.r1;
    expect(r1.attrs.stereotypes).toEqual(['trace']);
    expect(r1.attrs.stereotype).toBeUndefined();
  });
});
