import { validateUnknownExportPolicy } from '../unknownExportPolicy';
import type { Model } from '../types';

function baseModel(): Model {
  return {
    id: 'm1',
    metadata: { name: 'Test' },
    elements: {},
    relationships: {},
    views: {},
    folders: {},
  };
}

describe('validateUnknownExportPolicy', () => {
  test('bestEffort always ok and reports hasUnknown', () => {
    const m = baseModel();
    const res = validateUnknownExportPolicy(m, { mode: 'bestEffort' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.hasUnknown).toBe(false);
  });

  test('strict ok when no unknowns', () => {
    const m = baseModel();
    const res = validateUnknownExportPolicy(m, { mode: 'strict' });
    expect(res.ok).toBe(true);
  });

  test('strict blocks when unknown element exists', () => {
    const m = baseModel();
    (m as any).elements = {
      e1: { id: 'e1', type: 'Unknown', unknownType: { name: 'Foo' }, name: 'E1' },
    };
    const res = validateUnknownExportPolicy(m, { mode: 'strict' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain('Unknown element types');
      expect(res.reason).toContain('Foo (1)');
    }
  });

  test('strict blocks when unknown relationship exists', () => {
    const m = baseModel();
    (m as any).relationships = {
      r1: { id: 'r1', type: 'Unknown', unknownType: { ns: 'x', name: 'Bar' }, sourceElementId: 'a', targetElementId: 'b' },
    };
    const res = validateUnknownExportPolicy(m, { mode: 'strict' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain('Unknown relationship types');
      expect(res.reason).toContain('x:Bar (1)');
    }
  });

  test('strict uses custom message when provided', () => {
    const m = baseModel();
    (m as any).elements = {
      e1: { id: 'e1', type: 'Unknown', unknownType: { name: 'Foo' }, name: 'E1' },
    };
    const res = validateUnknownExportPolicy(m, { mode: 'strict', message: 'Nope' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('Nope');
  });
});
