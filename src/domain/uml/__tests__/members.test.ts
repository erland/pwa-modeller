import {
  coerceUmlClassifierMembersFromAttrs,
  sanitizeUmlClassifierMembersFromAttrs,
} from '../members';

describe('UML members coercion/sanitization', () => {
  it('A3: drops clearly wrong datatype tokens like uml:Property while keeping metaclass', () => {
    const rawAttrs = {
      attributes: [
        {
          name: 'foo',
          metaclass: 'uml:Property',
          dataTypeRef: 'uml:Property',
          dataTypeName: 'uml:Property',
        },
      ],
      operations: [],
    };

    const coerced = coerceUmlClassifierMembersFromAttrs(rawAttrs);
    expect(coerced.attributes).toHaveLength(1);
    expect(coerced.attributes[0].metaclass).toBe('uml:Property');
    expect(coerced.attributes[0].dataTypeRef).toBeUndefined();
    expect(coerced.attributes[0].dataTypeName).toBeUndefined();

    const sanitized = sanitizeUmlClassifierMembersFromAttrs(rawAttrs);
    expect(sanitized.attributes).toHaveLength(1);
    expect(sanitized.attributes[0]).toEqual({
      name: 'foo',
      metaclass: 'uml:Property',
    });
  });

  it('A3: legacy type field of uml:Property is treated as metaclass, not datatype', () => {
    const rawAttrs = {
      attributes: [{ name: 'bar', type: 'uml:Property' }],
      operations: [],
    };

    const coerced = coerceUmlClassifierMembersFromAttrs(rawAttrs);
    expect(coerced.attributes).toHaveLength(1);
    expect(coerced.attributes[0].metaclass).toBe('uml:Property');
    expect(coerced.attributes[0].dataTypeName).toBeUndefined();
  });
});
