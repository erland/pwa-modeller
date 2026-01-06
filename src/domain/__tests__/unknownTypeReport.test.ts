import { createEmptyModel } from '../factories';
import { collectUnknownTypes } from '../unknownTypeReport';

describe('collectUnknownTypes', () => {
  test('returns empty counts when model has no unknown types', () => {
    const model = createEmptyModel({ name: 'm' });
    const r = collectUnknownTypes(model);
    expect(r.hasUnknown).toBe(false);
    expect(r.elements.total).toBe(0);
    expect(r.relationships.total).toBe(0);
    expect(r.elements.byType).toEqual({});
    expect(r.relationships.byType).toEqual({});
  });

  test('counts unknown element and relationship types grouped by ns:name', () => {
    const model = createEmptyModel({ name: 'm' });

    model.elements = {
      el1: {
        id: 'el1',
        name: 'A',
        layer: 'Business',
        type: 'Unknown',
        unknownType: { ns: 'ea-xmi', name: '  Foo  ' }
      },
      el2: {
        id: 'el2',
        name: 'B',
        layer: 'Business',
        type: 'Unknown',
        unknownType: { ns: 'ea-xmi', name: 'Foo' }
      },
      el3: {
        id: 'el3',
        name: 'C',
        layer: 'Business',
        type: 'Unknown',
        unknownType: { name: 'Bar' }
      },
      el4: {
        id: 'el4',
        name: 'Known',
        layer: 'Business',
        type: 'BusinessActor',
        // Even if present, it must not be counted unless type === 'Unknown'
        unknownType: { ns: 'ea-xmi', name: 'Foo' }
      }
    };

    model.relationships = {
      r1: {
        id: 'r1',
        sourceElementId: 'el1',
        targetElementId: 'el2',
        type: 'Unknown',
        unknownType: { ns: 'archimate-exchange', name: 'WeirdRel' }
      },
      r2: {
        id: 'r2',
        sourceElementId: 'el2',
        targetElementId: 'el3',
        type: 'Unknown',
        unknownType: { ns: 'archimate-exchange', name: 'WeirdRel' }
      },
      r3: {
        id: 'r3',
        sourceElementId: 'el2',
        targetElementId: 'el4',
        type: 'Serving'
      }
    };

    const r = collectUnknownTypes(model);
    expect(r.hasUnknown).toBe(true);

    expect(r.elements.total).toBe(3);
    expect(r.elements.byType).toEqual({
      'ea-xmi:Foo': 2,
      Bar: 1
    });

    expect(r.relationships.total).toBe(2);
    expect(r.relationships.byType).toEqual({
      'archimate-exchange:WeirdRel': 2
    });
  });
});
