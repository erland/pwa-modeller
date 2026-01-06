import type { Element, Relationship } from '../types';
import { sanitizeUnknownTypeForElement, sanitizeUnknownTypeForRelationship } from '../unknownTypes';

describe('domain unknownTypes helpers', () => {
  test('sanitizeUnknownTypeForElement removes unknownType when type is known', () => {
    const el: Element = {
      id: 'el1',
      name: 'A',
      layer: 'Business',
      type: 'BusinessActor',
      unknownType: { ns: 'x', name: 'Foo' }
    };

    const next = sanitizeUnknownTypeForElement(el);
    expect(next.unknownType).toBeUndefined();
  });

  test('sanitizeUnknownTypeForElement normalizes unknownType when type is Unknown', () => {
    const el: Element = {
      id: 'el1',
      name: 'A',
      layer: 'Business',
      type: 'Unknown',
      unknownType: { ns: '  tool  ', name: '  CustomThing  ' }
    };

    const next = sanitizeUnknownTypeForElement(el);
    expect(next.unknownType).toEqual({ ns: 'tool', name: 'CustomThing' });
  });

  test('sanitizeUnknownTypeForElement fills missing name with "Unknown"', () => {
    const el: Element = {
      id: 'el1',
      name: 'A',
      layer: 'Business',
      type: 'Unknown',
      unknownType: { ns: '  ', name: '   ' }
    };

    const next = sanitizeUnknownTypeForElement(el);
    expect(next.unknownType).toEqual({ name: 'Unknown' });
  });

  test('sanitizeUnknownTypeForRelationship removes unknownType when type is known', () => {
    const rel: Relationship = {
      id: 'r1',
      sourceElementId: 'a',
      targetElementId: 'b',
      type: 'Serving',
      unknownType: { name: 'WeirdRel' }
    };

    const next = sanitizeUnknownTypeForRelationship(rel);
    expect(next.unknownType).toBeUndefined();
  });

  test('sanitizeUnknownTypeForRelationship normalizes unknownType when type is Unknown', () => {
    const rel: Relationship = {
      id: 'r1',
      sourceElementId: 'a',
      targetElementId: 'b',
      type: 'Unknown',
      unknownType: { ns: '  xmi  ', name: '  CustomRel  ' }
    };

    const next = sanitizeUnknownTypeForRelationship(rel);
    expect(next.unknownType).toEqual({ ns: 'xmi', name: 'CustomRel' });
  });
});
