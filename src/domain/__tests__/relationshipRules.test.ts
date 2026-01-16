import {
  getAllowedRelationshipTypes,
  initRelationshipValidationMatrixFromXml,
  setRelationshipValidationMatrix,
  validateRelationship,
} from '../config/archimatePalette';
import { parseRelationshipTableXml } from '../validation/relationshipMatrix';

const fs = require('fs');
const path = require('path');

function readRelationshipTable(): string {
  const p = path.resolve(__dirname, '../validation/data/relationships.xml');
  return fs.readFileSync(p, 'utf-8');
}

describe('relationship rules (fallback / minimal)', () => {
  beforeEach(() => {
    setRelationshipValidationMatrix(null);
  });

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

  test('fallback rejects some combinations the relationship table allows', () => {
    // Minimal rules require Serving to originate from a Service.
    expect(validateRelationship('CourseOfAction', 'Capability', 'Serving').allowed).toBe(false);
  });
});

describe('relationship rules (relationship table)', () => {
  const original = parseRelationshipTableXml(readRelationshipTable());

  beforeAll(() => {
    // Initialize the relationship matrix once for this test suite.
    initRelationshipValidationMatrixFromXml(readRelationshipTable());
  });

  afterAll(() => {
    // Avoid leaking state between test files.
    setRelationshipValidationMatrix(null);
  });

  test('table allows combinations that minimal rejects (example: CourseOfAction -> Capability Serving)', () => {
    expect(validateRelationship('CourseOfAction', 'Capability', 'Serving')).toEqual({ allowed: true });

    const allowed = getAllowedRelationshipTypes('CourseOfAction', 'Capability');
    expect(allowed).toContain('Serving');
  });

  test('table allows combinations that minimal rejects (example: Deliverable -> Plateau Realization)', () => {
    expect(validateRelationship('Deliverable', 'Plateau', 'Realization')).toEqual({ allowed: true });
  });

  test('derived relationships are honored when present', () => {
    // The bundled relationships.xml does not currently include derived letters.
    // Use small synthetic tables to verify derived behavior.
    const noDerived = `
      <relationships version="test">
        <source concept="BusinessProcess">
          <target concept="BusinessObject" relations="o"/>
        </source>
      </relationships>
    `.trim();

    const withDerived = `
      <relationships version="test">
        <source concept="BusinessProcess">
          <target concept="BusinessObject" relations="o" derived="a"/>
        </source>
      </relationships>
    `.trim();

    try {
      setRelationshipValidationMatrix(parseRelationshipTableXml(noDerived));
      expect(validateRelationship('BusinessProcess', 'BusinessObject', 'Access').allowed).toBe(false);

      setRelationshipValidationMatrix(parseRelationshipTableXml(withDerived));
      expect(validateRelationship('BusinessProcess', 'BusinessObject', 'Access')).toEqual({ allowed: true });
    } finally {
      // Restore the original matrix so other tests are unaffected.
      setRelationshipValidationMatrix(original);
    }
  });
});
