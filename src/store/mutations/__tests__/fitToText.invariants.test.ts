import { createElement, createView } from '../../../domain/factories';
import type { Model } from '../../../domain';
import { createEmptyModel } from '../../../domain';
import { applyViewElementSizes } from '../fitToText';

describe('applyViewElementSizes mutation invariants', () => {
  it('updates width/height on selected element nodes', () => {
    const model: Model = createEmptyModel({ name: 'M' });
    const e1 = createElement({ type: 'ApplicationComponent', layer: 'Application', name: 'A' });
    model.elements[e1.id] = e1;

    const view = createView({
      name: 'V',
      viewpointId: 'archimate.default',
      ownerRef: { kind: 'archimate', id: 'owner' },
      layout: {
        nodes: [{ elementId: e1.id, x: 10, y: 20, width: 120, height: 60 }],
        relationships: []
      },
      connections: []
    });
    model.views[view.id] = view;

    applyViewElementSizes(model, view.id, [{ elementId: e1.id, width: 222, height: 111 }]);

    const n = model.views[view.id].layout?.nodes.find((x) => x.elementId === e1.id);
    expect(n?.width).toBe(222);
    expect(n?.height).toBe(111);
  });
});
