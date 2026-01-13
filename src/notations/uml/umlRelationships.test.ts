import { umlNotation } from './index';

describe('umlNotation relationship styles', () => {
  test('generalization uses open triangle', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.generalization' })).toEqual({ markerEnd: 'triangleOpen' });
  });

  test('realization uses open triangle + dashed', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.realization' })).toEqual({
      markerEnd: 'triangleOpen',
      line: { pattern: 'dashed' },
    });
  });

  test('dependency uses open arrow + dashed', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.dependency' })).toEqual({
      markerEnd: 'arrowOpen',
      line: { pattern: 'dashed' },
    });
  });

  test('composition uses filled diamond at source', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.composition' })).toEqual({ markerStart: 'diamondFilled' });
  });

  test('association is undirected by default but can be directed with attrs', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.association' })).toEqual({});
    expect(umlNotation.getRelationshipStyle({ type: 'uml.association', attrs: { isDirected: true } })).toEqual({
      markerEnd: 'arrowOpen',
    });
  });
});

describe('umlNotation relationship guard rules', () => {
  test('disallows non-UML endpoints', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.dependency', sourceType: 'ApplicationComponent', targetType: 'uml.class' })
    ).toEqual({ allowed: false, reason: 'UML relationships require UML nodes.' });
  });

  test('realization is only allowed from class to interface', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.realization', sourceType: 'uml.class', targetType: 'uml.interface' })
    ).toEqual({ allowed: true });
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.realization', sourceType: 'uml.interface', targetType: 'uml.class' })
    ).toEqual({ allowed: false, reason: 'Realization is allowed from Class to Interface.' });
  });
});
