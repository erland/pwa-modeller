import { createEmptyModel, createElement, createRelationship, createView } from '../../../domain/factories';
import type { Model, View } from '../../../domain/types';
import {
  addElementToViewAt,
  removeElementFromView,
  updateViewNodeLayoutAny,
  updateViewNodePositionAny
} from '../layout';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

function putView(model: Model, view: View): void {
  model.views[view.id] = view;
  const rootId = getRootFolderId(model);
  model.folders[rootId] = { ...model.folders[rootId], viewIds: [...model.folders[rootId].viewIds, view.id] };
}

describe('store mutations: layout invariants', () => {
  test('addElementToViewAt snaps to grid and centers under cursor when snapToGrid enabled', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      formatting: { snapToGrid: true, gridSize: 20, layerStyleTags: {} }
    });
    putView(model, view);

    // Cursor at x=105,y=105 -> node is centered (subtract half size 70/35) => 35,70 -> snapped to 40,80.
    addElementToViewAt(model, view.id, el.id, 105, 105);

    const node = model.views[view.id].layout!.nodes.find((n) => n.elementId === el.id)!;
    expect(node.x).toBe(40);
    expect(node.y).toBe(80);
    expect(node.width).toBe(140);
    expect(node.height).toBe(70);
  });

  test('addElementToViewAt is idempotent and updates position when node already exists', () => {
    const model = createEmptyModel({ name: 'M' });
    const el = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[el.id] = el;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      formatting: { snapToGrid: false, gridSize: 20, layerStyleTags: {} }
    });
    putView(model, view);

    addElementToViewAt(model, view.id, el.id, 200, 200);
    addElementToViewAt(model, view.id, el.id, 300, 300);

    const nodes = model.views[view.id].layout!.nodes.filter((n) => n.elementId === el.id);
    expect(nodes).toHaveLength(1);

    const node = nodes[0];
    // snap disabled -> centered position is exact.
    expect(node.x).toBe(300 - 70);
    expect(node.y).toBe(300 - 35);
  });

  test('removeElementFromView removes node and drops relationship layouts whose relationships no longer exist', () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    const b = createElement({ name: 'B', layer: 'Application', type: 'ApplicationComponent' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({ sourceElementId: a.id, targetElementId: b.id, type: 'Serving' });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      layout: {
        nodes: [
          { elementId: a.id, x: 0, y: 0, width: 140, height: 70, zIndex: 0 },
          { elementId: b.id, x: 200, y: 0, width: 140, height: 70, zIndex: 1 }
        ],
        relationships: [
          { relationshipId: rel.id, points: [], zIndex: 0 },
          { relationshipId: 'missing_rel', points: [], zIndex: 1 }
        ]
      }
    });
    putView(model, view);

    removeElementFromView(model, view.id, a.id);

    const next = model.views[view.id].layout!;
    expect(next.nodes.some((n) => n.elementId === a.id)).toBe(false);
    // missing relationship layout should be dropped
    expect(next.relationships.some((r) => r.relationshipId === 'missing_rel')).toBe(false);
    // existing relationship layout remains
    expect(next.relationships.some((r) => r.relationshipId === rel.id)).toBe(true);
  });

  test('updateViewNodePositionAny updates matching element and leaves others unchanged', () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    const b = createElement({ name: 'B', layer: 'Business', type: 'BusinessRole' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      layout: {
        nodes: [
          { elementId: a.id, x: 0, y: 0, width: 140, height: 70, zIndex: 0 },
          { elementId: b.id, x: 10, y: 10, width: 140, height: 70, zIndex: 1 }
        ],
        relationships: []
      }
    });
    putView(model, view);

    updateViewNodePositionAny(model, view.id, { elementId: a.id }, 123, 456);

    const nodes = model.views[view.id].layout!.nodes;
    const na = nodes.find((n) => n.elementId === a.id)!;
    const nb = nodes.find((n) => n.elementId === b.id)!;
    expect(na.x).toBe(123);
    expect(na.y).toBe(456);
    expect(nb.x).toBe(10);
    expect(nb.y).toBe(10);
  });

  test('updateViewNodeLayoutAny preserves identity fields (elementId/connectorId/objectId)', () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', layer: 'Business', type: 'BusinessActor' });
    model.elements[a.id] = a;

    const view = createView({
      name: 'V',
      viewpointId: 'layered',
      layout: {
        nodes: [{ elementId: a.id, x: 0, y: 0, width: 140, height: 70, zIndex: 0 }],
        relationships: []
      }
    });
    putView(model, view);

    updateViewNodeLayoutAny(model, view.id, { elementId: a.id }, { width: 222, height: 111, elementId: 'hijack' as any });

    const node = model.views[view.id].layout!.nodes[0];
    expect(node.elementId).toBe(a.id);
    expect(node.width).toBe(222);
    expect(node.height).toBe(111);
  });
});
