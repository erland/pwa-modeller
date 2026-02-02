import { createEmptyModel } from '../../factories';
import type { ExternalIdRef, Model } from '../../types';
import { computeModelSignature } from '../modelSignature';

function ext(system: string, id: string, scope?: string): ExternalIdRef {
  return scope ? { system, id, scope } : { system, id };
}

describe('computeModelSignature', () => {
  it('is stable for the same set of external keys independent of ordering', () => {
    const m1: Model = createEmptyModel({ name: 'A' }, 'm1');
    m1.elements['e1'] = {
      id: 'e1',
      name: 'E1',
      type: 'ApplicationComponent',
      externalIds: [ext('archimate-meff', 'EAID_2'), ext('archimate-meff', 'EAID_1')]
    };
    m1.elements['e2'] = {
      id: 'e2',
      name: 'E2',
      type: 'ApplicationComponent',
      externalIds: [ext('archimate-meff', 'EAID_3')]
    };
    m1.relationships['r1'] = {
      id: 'r1',
      type: 'Association',
      sourceElementId: 'e1',
      targetElementId: 'e2',
      externalIds: [ext('xmi', 'X1')]
    };

    const m2: Model = createEmptyModel({ name: 'A' }, 'm2');
    // Different insertion order + external ids order reversed
    m2.relationships['r1'] = {
      id: 'r1',
      type: 'Association',
      sourceElementId: 'e1',
      targetElementId: 'e2',
      externalIds: [ext('xmi', 'X1')]
    };
    m2.elements['e2'] = {
      id: 'e2',
      name: 'E2',
      type: 'ApplicationComponent',
      externalIds: [ext('archimate-meff', 'EAID_3')]
    };
    m2.elements['e1'] = {
      id: 'e1',
      name: 'E1',
      type: 'ApplicationComponent',
      externalIds: [ext('archimate-meff', 'EAID_1'), ext('archimate-meff', 'EAID_2')]
    };

    expect(computeModelSignature(m1)).toEqual(computeModelSignature(m2));
    expect(computeModelSignature(m1).startsWith('ext-')).toBe(true);
  });

  it('changes when the set of external keys changes', () => {
    const m1: Model = createEmptyModel({ name: 'A' }, 'm1');
    m1.elements['e1'] = { id: 'e1', name: 'E1', type: 'ApplicationComponent', externalIds: [ext('archimate-meff', 'EAID_1')] };
    const s1 = computeModelSignature(m1);

    m1.elements['e2'] = { id: 'e2', name: 'E2', type: 'ApplicationComponent', externalIds: [ext('archimate-meff', 'EAID_2')] };
    const s2 = computeModelSignature(m1);

    expect(s1).not.toEqual(s2);
  });

  it('falls back to internal ids when no external keys exist', () => {
    const m: Model = createEmptyModel({ name: 'A' }, 'm1');
    m.elements['e1'] = { id: 'e1', name: 'E1', type: 'ApplicationComponent' };
    m.relationships['r1'] = { id: 'r1', type: 'Association', sourceElementId: 'e1', targetElementId: 'e1' };

    const s = computeModelSignature(m);
    expect(s.startsWith('int-')).toBe(true);
  });
});
