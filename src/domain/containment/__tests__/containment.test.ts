import { createElement, createEmptyModel } from '../../factories';
import { applyContainmentInvariants } from '../applyContainmentInvariants';
import { buildChildrenIndex, canSetParent, getAncestors, getDescendants, isAncestor } from '../containment';

function addEl(model: ReturnType<typeof createEmptyModel>, name: string, parentElementId?: string) {
  const el = createElement({ name, type: 'uml.class', parentElementId });
  model.elements[el.id] = el;
  return el.id;
}

describe('containment helpers', () => {
  test('ancestors / descendants basic traversal', () => {
    const model = createEmptyModel({ name: 'm' });
    const a = addEl(model, 'A');
    const b = addEl(model, 'B', a);
    const c = addEl(model, 'C', b);

    expect(getAncestors(model, c)).toEqual([b, a]);
    expect(isAncestor(model, a, c)).toBe(true);
    expect(isAncestor(model, c, a)).toBe(false);

    const desc = getDescendants(model, a);
    expect(desc.sort()).toEqual([b, c].sort());

    const idx = buildChildrenIndex(model);
    expect(idx.get(a)).toEqual([b]);
    expect(idx.get(b)).toEqual([c]);
    expect(idx.get(null)).toEqual([a]);
  });

  test('canSetParent blocks missing parent, self-parent, and cycles', () => {
    const model = createEmptyModel({ name: 'm' });
    const a = addEl(model, 'A');
    const b = addEl(model, 'B', a);

    expect(canSetParent(model, b, 'missing')).toEqual({ ok: false, reason: 'Unknown parent element: missing' });
    expect(canSetParent(model, b, b)).toEqual({ ok: false, reason: 'An element cannot be its own parent.' });

    // Would create cycle: set A's parent to B
    expect(canSetParent(model, a, b).ok).toBe(false);
  });

  test('applyContainmentInvariants clears missing parent and breaks cycles', () => {
    const model = createEmptyModel({ name: 'm' });
    const a = addEl(model, 'A');
    const b = addEl(model, 'B', a);

    // missing parent
    const c = addEl(model, 'C', 'missing');

    // introduce cycle: A -> B, B -> A
    model.elements[a] = { ...model.elements[a], parentElementId: b };
    model.elements[b] = { ...model.elements[b], parentElementId: a };

    const fixed = applyContainmentInvariants(model);

    expect(fixed.elements[c].parentElementId).toBeUndefined();

    // cycle should be broken (at least one of the two edges removed)
    const ap = fixed.elements[a].parentElementId;
    const bp = fixed.elements[b].parentElementId;
    expect(!(ap === b && bp === a)).toBe(true);
  });
});
