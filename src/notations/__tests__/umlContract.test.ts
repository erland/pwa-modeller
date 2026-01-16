import * as React from 'react';

import { umlNotation } from '../uml';

function isTypeOptionArray(value: unknown): value is Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) return false;
  return value.every((x) => {
    if (!x || typeof x !== 'object') return false;
    const r = x as Record<string, unknown>;
    return typeof r.id === 'string' && typeof r.label === 'string';
  });
}

describe('UML notation contract', () => {
  test('exposes required contract surface', () => {
    expect(umlNotation.kind).toBe('uml');

    // Required functions from the Notation contract.
    const requiredFnNames = [
      'getElementBgVar',
      'renderNodeSymbol',
      'getRelationshipStyle',
      'canCreateNode',
      'canCreateRelationship',
      'getElementTypeOptions',
      'getRelationshipTypeOptions',
      'getElementPropertySections',
      'renderRelationshipProperties',
      'validateNotation',
    ] as const;

    for (const name of requiredFnNames) {
      expect(typeof (umlNotation as any)[name]).toBe('function');
    }
  });

  test('catalogs return sane options and match guards', () => {
    const elementTypeOptions = umlNotation.getElementTypeOptions();
    expect(isTypeOptionArray(elementTypeOptions)).toBe(true);
    expect(elementTypeOptions.length).toBeGreaterThan(0);

    // The UML palette should include core types.
    const elementTypeIds = elementTypeOptions.map((x) => x.id);
    expect(elementTypeIds).toContain('uml.class');
    expect(elementTypeIds).toContain('uml.interface');
    expect(elementTypeIds).toContain('uml.usecase');
    expect(elementTypeIds).toContain('uml.actor');

    // Every element type listed in the catalog must be creatable in UML.
    for (const id of elementTypeIds) {
      expect(umlNotation.canCreateNode({ nodeType: id })).toBe(true);
    }

    const relTypeOptions = umlNotation.getRelationshipTypeOptions();
    expect(isTypeOptionArray(relTypeOptions)).toBe(true);
    expect(relTypeOptions.length).toBeGreaterThan(0);

    const relTypeIds = relTypeOptions.map((x) => x.id);
    expect(relTypeIds).toContain('uml.association');
    expect(relTypeIds).toContain('uml.generalization');

    // Relationship styles should be objects and must not throw for known types.
    for (const id of relTypeIds) {
      const style = umlNotation.getRelationshipStyle({ type: id });
      expect(style).toBeDefined();
      expect(typeof style).toBe('object');
    }

    // Guards should behave for a few representative combinations.
    expect(
      umlNotation.canCreateRelationship({
        relationshipType: 'uml.association',
        sourceType: 'uml.class',
        targetType: 'uml.interface',
      }).allowed
    ).toBe(true);

    expect(
      umlNotation.canCreateRelationship({
        relationshipType: 'uml.realization',
        sourceType: 'uml.class',
        targetType: 'uml.interface',
      }).allowed
    ).toBe(true);

    expect(
      umlNotation.canCreateRelationship({
        relationshipType: 'uml.realization',
        sourceType: 'uml.interface',
        targetType: 'uml.class',
      }).allowed
    ).toBe(false);

    expect(
      umlNotation.canCreateRelationship({
        relationshipType: 'not-a-uml-relationship',
        sourceType: 'uml.class',
        targetType: 'uml.class',
      }).allowed
    ).toBe(false);
  });

  test('basic render helpers return React nodes', () => {
    const bg = umlNotation.getElementBgVar('uml.class');
    expect(typeof bg).toBe('string');

    const symbol = umlNotation.renderNodeSymbol({ nodeType: 'uml.class', title: 'MyClass' });
    expect(symbol === null || React.isValidElement(symbol) || typeof symbol === 'string').toBe(true);
  });
});
