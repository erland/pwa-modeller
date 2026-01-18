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

  test('include/extend use dashed open arrow + stereotype label', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.include' })).toEqual({
      markerEnd: 'arrowOpen',
      line: { pattern: 'dashed' },
      midLabel: '«include»',
    });

    expect(umlNotation.getRelationshipStyle({ type: 'uml.extend' })).toEqual({
      markerEnd: 'arrowOpen',
      line: { pattern: 'dashed' },
      midLabel: '«extend»',
    });
  });

  test('deployment uses dashed open arrow + stereotype label', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.deployment' })).toEqual({
      markerEnd: 'arrowOpen',
      line: { pattern: 'dashed' },
      midLabel: '«deployment»',
    });
  });

  test('communicationPath is an undirected solid line', () => {
    expect(umlNotation.getRelationshipStyle({ type: 'uml.communicationPath' })).toEqual({});
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

  test('realization is allowed from class/component to interface', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.realization', sourceType: 'uml.class', targetType: 'uml.interface' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.realization', sourceType: 'uml.component', targetType: 'uml.interface' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.realization', sourceType: 'uml.interface', targetType: 'uml.class' })
    ).toEqual({ allowed: false, reason: 'Realization is allowed from Class/Component to Interface.' });
  });

  test('include/extend are allowed only between use cases', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.include', sourceType: 'uml.usecase', targetType: 'uml.usecase' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.extend', sourceType: 'uml.actor', targetType: 'uml.usecase' })
    ).toEqual({ allowed: false, reason: 'Include/Extend is allowed only between Use Cases.' });
  });

  test('deployment is allowed from artifact to node/device/executionEnvironment', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.deployment', sourceType: 'uml.artifact', targetType: 'uml.node' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.deployment', sourceType: 'uml.artifact', targetType: 'uml.device' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.deployment', sourceType: 'uml.artifact', targetType: 'uml.executionEnvironment' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.deployment', sourceType: 'uml.node', targetType: 'uml.artifact' })
    ).toEqual({ allowed: false, reason: 'Deployment source should be an Artifact.' });
  });

  test('communicationPath is allowed only between node/device/executionEnvironment', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.communicationPath', sourceType: 'uml.node', targetType: 'uml.device' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.communicationPath', sourceType: 'uml.class', targetType: 'uml.node' })
    ).toEqual({ allowed: false, reason: 'Communication Path is allowed between Nodes/Devices/Execution Environments.' });
  });

  test('association is allowed in use case diagrams (actor/usecase and usecase/usecase)', () => {
    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.association', sourceType: 'uml.actor', targetType: 'uml.usecase' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.association', sourceType: 'uml.usecase', targetType: 'uml.actor' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.association', sourceType: 'uml.usecase', targetType: 'uml.usecase' })
    ).toEqual({ allowed: true });

    expect(
      umlNotation.canCreateRelationship({ relationshipType: 'uml.association', sourceType: 'uml.actor', targetType: 'uml.actor' })
    ).toEqual({ allowed: false, reason: 'Association is allowed between classifiers, between use cases, or between an actor and a use case.' });
  });
});
