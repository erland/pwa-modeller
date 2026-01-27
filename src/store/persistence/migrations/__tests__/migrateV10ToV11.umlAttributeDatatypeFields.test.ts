import { createElement, createEmptyModel } from '../../../../domain';
import { migrateModel } from '../index';

describe('migrations v10 -> v11 (UML attribute datatype field rename)', () => {
  test('renames legacy UmlAttribute.type/typeName/typeRef to dataTypeName/dataTypeRef and bumps schemaVersion', () => {
    const model: any = createEmptyModel({ name: 'Legacy v10 UML attrs' });
    model.schemaVersion = 10;

    const cls = createElement({ name: 'A', type: 'uml.class' }) as any;
    cls.attrs = {
      attributes: [
        { name: 'foo', type: 'String', typeRef: 'T1', typeName: 'String' },
        { name: 'bar', metaclass: 'uml:Property', typeRef: 'T2' },
      ],
      operations: [{ name: 'op', returnType: 'void' }],
    };
    model.elements[cls.id] = cls;

    const migrated: any = migrateModel(model);
    expect(migrated.schemaVersion).toBe(11);

    const next = migrated.elements[cls.id];
    expect(next.attrs).toBeDefined();
    expect(next.attrs.attributes).toEqual([
      { name: 'foo', dataTypeRef: 'T1', dataTypeName: 'String' },
      { name: 'bar', metaclass: 'uml:Property', dataTypeRef: 'T2' },
    ]);

    // Operations are not affected by this migration.
    expect(next.attrs.operations).toEqual([{ name: 'op', returnType: 'void' }]);
  });
});
