import { extractLayoutInputForView } from '../extractLayoutInputForView';
import {
  makeElement,
  makeIdFactory,
  makeModel,
  makeRelationship,
  makeView,
  makeViewConnection,
  makeViewLayout,
  makeViewNode
} from '../../../test/builders/modelBuilders';

describe('extractLayoutInputForView', () => {
  test('ignores view-local nodes (objectId) and applies default element sizes when width/height missing', () => {
    const id = makeIdFactory('t');

    const elA = makeElement({ id: 'a', type: 'archimate.businessActor', name: 'A' }, id);
    const elB = makeElement({ id: 'b', type: 'archimate.businessRole', name: 'B' }, id);

    // NOTE: ViewNodeLayout requires width/height, but older/invalid data may omit it.
    // We intentionally cast to exercise defaulting logic.
    const nodeA = ({
      ...makeViewNode({ elementId: elA.id, x: 0, y: 0 }),
      width: undefined,
      height: undefined
    } as unknown) as ReturnType<typeof makeViewNode>;

    const nodeB = makeViewNode({ elementId: elB.id, x: 10, y: 10, width: 10, height: 10 });
    const note = makeViewNode({ objectId: 'note_1', x: 1, y: 1, width: 50, height: 20 });

    const rel = makeRelationship({
      id: 'r1',
      type: 'archimate.assignment',
      sourceElementId: elA.id,
      targetElementId: elB.id
    });

    const viewId = 'v1';
    const view = makeView({
      id: viewId,
      kind: 'archimate',
      name: 'V',
      layout: makeViewLayout({ nodes: [nodeB, note, nodeA] }),
      connections: [
        makeViewConnection({
          id: 'c1',
          viewId,
          relationshipId: rel.id,
          source: { kind: 'element', id: elA.id },
          target: { kind: 'element', id: elB.id }
        })
      ]
    });

    const model = makeModel({
      elements: { [elA.id]: elA, [elB.id]: elB },
      relationships: { [rel.id]: rel },
      views: { [view.id]: view }
    });

    const out = extractLayoutInputForView(model, view.id, {});

    // objectId node ignored; nodes are normalized/sorted by id
    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b']);

    // defaults for archimate elements: 120x60
    const aNode = out.nodes.find((n) => n.id === 'a')!;
    expect(aNode.width).toBe(120);
    expect(aNode.height).toBe(60);
  });

  test('filters edges whose endpoints are not in the extracted node set', () => {
    const id = makeIdFactory('t');
    const elA = makeElement({ id: 'a', type: 'archimate.businessActor' }, id);
    const elB = makeElement({ id: 'b', type: 'archimate.businessRole' }, id);

    const relOk = makeRelationship({
      id: 'r_ok',
      type: 'archimate.flow',
      sourceElementId: elA.id,
      targetElementId: elB.id
    });

    const viewId = 'v1';
    const view = makeView({
      id: viewId,
      kind: 'archimate',
      name: 'V',
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ elementId: elA.id, x: 0, y: 0, width: 10, height: 10 }),
          makeViewNode({ elementId: elB.id, x: 0, y: 0, width: 10, height: 10 })
        ]
      }),
      connections: [
        // valid
        makeViewConnection({
          id: 'c_ok',
          viewId,
          relationshipId: relOk.id,
          source: { kind: 'element', id: elA.id },
          target: { kind: 'element', id: elB.id }
        }),
        // invalid target (not a node in this view)
        makeViewConnection({
          id: 'c_bad',
          viewId,
          relationshipId: 'r_missing',
          source: { kind: 'element', id: elA.id },
          target: { kind: 'element', id: 'does_not_exist' }
        })
      ]
    });

    const model = makeModel({
      elements: { [elA.id]: elA, [elB.id]: elB },
      relationships: { [relOk.id]: relOk },
      views: { [view.id]: view }
    });

    const out = extractLayoutInputForView(model, view.id, {});
    expect(out.edges.map((e) => e.id)).toEqual(['c_ok']);
    expect(out.edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b' });
  });

  test('is deterministic: normalizes node ordering and edge ordering', () => {
    const elA = makeElement({ id: 'a', type: 'archimate.applicationComponent' });
    const elB = makeElement({ id: 'b', type: 'archimate.applicationService' });
    const elC = makeElement({ id: 'c', type: 'archimate.applicationInterface' });

    const viewId = 'v1';
    const view = makeView({
      id: viewId,
      kind: 'archimate',
      name: 'V',
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ elementId: 'b', x: 0, y: 0, width: 10, height: 10 }),
          makeViewNode({ elementId: 'a', x: 0, y: 0, width: 10, height: 10 }),
          makeViewNode({ elementId: 'c', x: 0, y: 0, width: 10, height: 10 })
        ]
      }),
      connections: [
        // Intentionally out of order: (b->c) then (a->b)
        makeViewConnection({
          id: 'e2',
          viewId,
          relationshipId: 'r2',
          source: { kind: 'element', id: 'b' },
          target: { kind: 'element', id: 'c' }
        }),
        makeViewConnection({
          id: 'e1',
          viewId,
          relationshipId: 'r1',
          source: { kind: 'element', id: 'a' },
          target: { kind: 'element', id: 'b' }
        })
      ]
    });

    const model = makeModel({
      elements: { a: elA, b: elB, c: elC },
      // relationships are optional for edge extraction from connections
      views: { [view.id]: view }
    });

    const out = extractLayoutInputForView(model, view.id, {});
    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);

    // Edge ordering: by sourceId, then targetId, then weight desc, then id.
    expect(out.edges.map((e) => `${e.sourceId}->${e.targetId}:${e.id}`)).toEqual(['a->b:e1', 'b->c:e2']);
  });

  test('selection scope only includes selected nodes and edges between them', () => {
    const elA = makeElement({ id: 'a', type: 'archimate.businessActor' });
    const elB = makeElement({ id: 'b', type: 'archimate.businessRole' });
    const elC = makeElement({ id: 'c', type: 'archimate.businessObject' });

    const viewId = 'v1';
    const view = makeView({
      id: viewId,
      kind: 'archimate',
      name: 'V',
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ elementId: 'a', x: 0, y: 0, width: 10, height: 10 }),
          makeViewNode({ elementId: 'b', x: 0, y: 0, width: 10, height: 10 }),
          makeViewNode({ elementId: 'c', x: 0, y: 0, width: 10, height: 10 })
        ]
      }),
      connections: [
        makeViewConnection({
          id: 'ab',
          viewId,
          relationshipId: 'r_ab',
          source: { kind: 'element', id: 'a' },
          target: { kind: 'element', id: 'b' }
        }),
        makeViewConnection({
          id: 'bc',
          viewId,
          relationshipId: 'r_bc',
          source: { kind: 'element', id: 'b' },
          target: { kind: 'element', id: 'c' }
        })
      ]
    });

    const model = makeModel({
      elements: { a: elA, b: elB, c: elC },
      views: { [view.id]: view }
    });

    const out = extractLayoutInputForView(model, view.id, { scope: 'selection' }, ['b', 'a', 'a', '', 'missing']);

    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out.edges.map((e) => e.id)).toEqual(['ab']);
  });
});
