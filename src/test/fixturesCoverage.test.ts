import { buildTinyGraphModel } from './fixtures/models/tinyGraph';
import { buildModelWithMovedNode } from './fixtures/models/withMovedNode';
import { buildModelWithMissingRefs } from './fixtures/models/withMissingRefs';
import { rectA, rectB, polylineAtoB } from './fixtures/geometry';
import {
  makeElement,
  makeRelationship,
  makeView,
  makeViewNode,
  makeViewRelationshipLayout,
  makeModelWithContent,
  makeIdFactory,
} from './builders';

describe('test fixtures and builders are loadable', () => {
  test('model fixtures build deterministic models', () => {
    const m1 = buildTinyGraphModel();
    const m2 = buildTinyGraphModel();
    expect(Object.keys(m1.elements).length).toBeGreaterThan(0);
    // deterministic by fixture: same ids when rebuilt
    expect(Object.keys(m1.elements).sort()).toEqual(Object.keys(m2.elements).sort());

    const moved = buildModelWithMovedNode();
    expect(Object.keys(moved.views).length).toBeGreaterThan(0);

    const missing = buildModelWithMissingRefs();
    expect(Object.keys(missing.views).length).toBeGreaterThan(0);
  });

  test('geometry fixtures export expected shapes', () => {
    expect(rectA.width).toBeGreaterThan(0);
    expect(rectB.x).toBeGreaterThan(rectA.x);
    expect(polylineAtoB.length).toBeGreaterThanOrEqual(2);
    expect(polylineAtoB[0]).toHaveProperty('x');
    expect(polylineAtoB[0]).toHaveProperty('y');
  });

  test('builders can construct a tiny model without throwing', () => {
    const id = makeIdFactory('cov');

    const e1 = makeElement({ type: 'ApplicationComponent', name: 'A' }, id);
    const e2 = makeElement({ type: 'ApplicationComponent', name: 'B' }, id);
    const r1 = makeRelationship({ type: 'Serving', sourceElementId: e1.id, targetElementId: e2.id }, id);

    const v1 = makeView({ kind: 'archimate', name: 'V' }, id);
    const n1 = makeViewNode({ elementId: e1.id, x: 10, y: 10 }, id);
    const n2 = makeViewNode({ elementId: e2.id, x: 200, y: 10 }, id);
    const vr1 = makeViewRelationshipLayout({
      relationshipId: r1.id,
      sourceNodeId: n1.id,
      targetNodeId: n2.id,
    }, id);

    v1.layout.nodes = [n1, n2];
    v1.layout.relationships = [vr1];

    const m = makeModelWithContent({ elements: [e1, e2], relationships: [r1], views: [v1] }, id);

    expect(m.elements[e1.id].name).toBe('A');
    expect(m.relationships[r1.id].sourceElementId).toBe(e1.id);
    expect(Object.keys(m.views)).toContain(v1.id);
  });
});
