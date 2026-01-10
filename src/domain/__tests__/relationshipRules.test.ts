import { getAllowedRelationshipTypes, initRelationshipValidationMatrixFromXml, validateRelationship, setRelationshipValidationMatrix } from '../config/archimatePalette';
import { parseRelationshipTableXml } from '../validation/relationshipMatrix';

const fs = require('fs');
const path = require('path');

function readRelationshipTable(): string {
  // This file is added in Step 1 and used for 'full' validation modes.
  const p = path.resolve(__dirname, '../validation/data/relationships.xml');
  return fs.readFileSync(p, 'utf-8');
}


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


describe('relationship rules (modes)', () => {
  beforeAll(() => {
    // Initialize the full relationship matrix once for this test suite.
    initRelationshipValidationMatrixFromXml(readRelationshipTable());
  });

  test('full mode uses relationship tables (example: CourseOfAction -> Capability Serving)', () => {
    // Minimal rules require Serving to originate from a Service.
    expect(validateRelationship('CourseOfAction', 'Capability', 'Serving', 'minimal').allowed).toBe(false);

    // Relationship tables allow Serving for this concept pair (per relationships.xml).
    expect(validateRelationship('CourseOfAction', 'Capability', 'Serving', 'full')).toEqual({ allowed: true });

    const allowedMinimal = getAllowedRelationshipTypes('CourseOfAction', 'Capability', 'minimal');
    expect(allowedMinimal).not.toContain('Serving');

    const allowedFull = getAllowedRelationshipTypes('CourseOfAction', 'Capability', 'full');
    expect(allowedFull).toContain('Serving');
  });

  test('full mode allows combinations that minimal rejects (example: Deliverable -> Plateau Realization)', () => {
    expect(validateRelationship('Deliverable', 'Plateau', 'Realization', 'minimal').allowed).toBe(false);
    expect(validateRelationship('Deliverable', 'Plateau', 'Realization', 'full')).toEqual({ allowed: true });
  });

  test('full_derived includes derived relationships (synthetic table)', () => {
    // The bundled relationships.xml does not currently include "derived" letters.
    // Use a small synthetic table to verify derived behavior.
    const synthetic = `
      <relationships version="test">
        <source concept="BusinessProcess">
          <target concept="BusinessObject" relations="o" derived="a"/>
        </source>
      </relationships>
    `.trim();

    const original = parseRelationshipTableXml(readRelationshipTable());
    try {
      setRelationshipValidationMatrix(parseRelationshipTableXml(synthetic));

      // Access is not in core (relations="o"), so 'full' should reject it...
      expect(validateRelationship('BusinessProcess', 'BusinessObject', 'Access', 'full').allowed).toBe(false);
      // ...but 'full_derived' should allow it via derived="a".
      expect(validateRelationship('BusinessProcess', 'BusinessObject', 'Access', 'full_derived')).toEqual({ allowed: true });
    } finally {
      // Restore the original matrix so other tests are unaffected.
      setRelationshipValidationMatrix(original);
    }
  });
});
