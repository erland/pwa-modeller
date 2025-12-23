import { getAllowedRelationshipTypes, validateRelationship } from '../config/archimatePalette';

describe('relationship rules (minimal)', () => {
  test('Serving must originate from a Service', () => {
    expect(validateRelationship('BusinessService', 'BusinessActor', 'Serving')).toEqual({ allowed: true });
    expect(validateRelationship('BusinessActor', 'BusinessService', 'Serving').allowed).toBe(false);
  });

  test('Assignment limited to active -> behavior (minimal)', () => {
    expect(validateRelationship('BusinessActor', 'BusinessProcess', 'Assignment').allowed).toBe(true);
    expect(validateRelationship('BusinessProcess', 'BusinessActor', 'Assignment').allowed).toBe(false);
  });

  test('getAllowedRelationshipTypes filters out forbidden combinations', () => {
    const allowed = getAllowedRelationshipTypes('BusinessActor', 'BusinessService');
    expect(allowed).not.toContain('Serving');
    // Association is intentionally permissive.
    expect(allowed).toContain('Association');
  });
});
