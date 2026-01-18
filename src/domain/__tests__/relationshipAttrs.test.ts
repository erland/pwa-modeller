import { sanitizeRelationshipAttrs } from '../relationshipAttrs';

describe('domain relationshipAttrs helpers', () => {
  test('returns undefined when attrs is undefined', () => {
    expect(sanitizeRelationshipAttrs('Access', undefined)).toBeUndefined();
  });

  test('Access keeps only valid accessType', () => {
    expect(
      sanitizeRelationshipAttrs('Access', { accessType: 'ReadWrite', isDirected: true, influenceStrength: '++' })
    ).toEqual({ accessType: 'ReadWrite' });

    // invalid accessType should be dropped
    expect(sanitizeRelationshipAttrs('Access', { accessType: 'Nope' as any })).toBeUndefined();
  });

  test('Association keeps only boolean isDirected', () => {
    expect(
      sanitizeRelationshipAttrs('Association', { isDirected: true, accessType: 'Read' as any, influenceStrength: 'x' })
    ).toEqual({ isDirected: true });

    // non-boolean should be dropped
    expect(sanitizeRelationshipAttrs('Association', { isDirected: 'true' as any })).toBeUndefined();
  });

  test('Influence keeps only non-empty influenceStrength and trims it', () => {
    expect(
      sanitizeRelationshipAttrs('Influence', { influenceStrength: '  ++  ', isDirected: true, accessType: 'Read' as any })
    ).toEqual({ influenceStrength: '++' });

    // empty/whitespace should be dropped
    expect(sanitizeRelationshipAttrs('Influence', { influenceStrength: '   ' })).toBeUndefined();

    // non-string should be coerced to string (best effort)
    expect(sanitizeRelationshipAttrs('Influence', { influenceStrength: 5 as any })).toEqual({ influenceStrength: '5' });
  });

  test('Other relationship types drop all attributes', () => {
    expect(
      sanitizeRelationshipAttrs('Serving', { accessType: 'ReadWrite', isDirected: true, influenceStrength: '++' })
    ).toBeUndefined();
  });

  test('UML keeps attrs but normalizes well-known end metadata fields', () => {
    // null/undefined handling
    expect(sanitizeRelationshipAttrs('uml.association' as any, null as any)).toBeUndefined();

    // trims strings, keeps unknown keys, drops invalid booleans and empty strings
    expect(
      sanitizeRelationshipAttrs('uml.association' as any, {
        sourceRole: '  src  ',
        targetRole: '   ',
        sourceMultiplicity: ' 1..* ',
        targetMultiplicity: 2,
        sourceNavigable: true,
        targetNavigable: 'true',
        stereotype: '  <<x>>  ',
        vendorFoo: 123,
      } as any)
    ).toEqual({
      sourceRole: 'src',
      sourceMultiplicity: '1..*',
      targetMultiplicity: '2',
      sourceNavigable: true,
      stereotype: '<<x>>',
      vendorFoo: 123,
    });

    // if all fields are empty/invalid and no other keys remain, return undefined
    expect(
      sanitizeRelationshipAttrs('uml.association' as any, { sourceRole: '  ', targetRole: '' } as any)
    ).toBeUndefined();
  });
});
