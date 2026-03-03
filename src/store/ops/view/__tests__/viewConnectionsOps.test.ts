import { makeModel } from "../../../../test/builders/modelBuilders";
import { createViewConnectionsOps } from "../viewConnectionsOps";
import { makeElement, makeRelationship, makeView, makeViewLayout, makeViewNode, makeViewRelationshipLayout, makeViewConnection } from "../../../../test/builders/modelBuilders";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("viewConnectionsOps", () => {
  test("ensureViewConnections materializes missing connections for visible relationships", () => {
    const e1 = makeElement({ name: "E1" });
    const e2 = makeElement({ name: "E2" });
    const rel = makeRelationship({
      type: "archimate:flow",
      sourceElementId: e1.id,
      targetElementId: e2.id,
    });

    const view = makeView({
      name: "V",
      connections: [],
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ id: "vn1", elementId: e1.id }),
          makeViewNode({ id: "vn2", elementId: e2.id })
        ],
        relationships: [makeViewRelationshipLayout({ relationshipId: rel.id })]
      })
    });

    let model = makeModel({
      elements: { [e1.id]: e1, [e2.id]: e2 },
      relationships: { [rel.id]: rel },
      views: { [view.id]: view },
    });

    const recordTouched = jest.fn();
    const ops = createViewConnectionsOps({
      getModel: () => model,
      updateModel: (mutator) => {
        const next = clone(model);
        mutator(next);
        model = next;
      },
      recordTouched
    });

    ops.ensureViewConnections(view.id);

    const updated = model.views[view.id];
    expect(updated.connections).toHaveLength(1);
    expect(updated.connections[0].relationshipId).toBe(rel.id);
    expect(updated.connections[0].source).toEqual({ kind: "element", id: e1.id });
    expect(updated.connections[0].target).toEqual({ kind: "element", id: e2.id });
    expect(recordTouched).toHaveBeenCalledTimes(1);
  });

  test("ensureViewConnections prunes connections not present in layout", () => {
    const e1 = makeElement({ name: "E1" });
    const e2 = makeElement({ name: "E2" });
    const rel = makeRelationship({
      type: "archimate:flow",
      sourceElementId: e1.id,
      targetElementId: e2.id,
    });

    const view = makeView({
      name: "V",
      connections: [
        makeViewConnection({ relationshipId: rel.id, source: { kind: "element", id: e1.id }, target: { kind: "element", id: e2.id } })
      ],
      // In implicit mode, an empty layout.relationships list means "show all relationships".
      // To make the relationship *not* visible (and therefore pruned), switch to explicit mode
      // without including the relationship id.
      relationshipVisibility: { mode: "explicit", relationshipIds: [] },
      layout: makeViewLayout({
        nodes: [
          makeViewNode({ id: "vn1", elementId: e1.id }),
          makeViewNode({ id: "vn2", elementId: e2.id })
        ],
        relationships: [] // relationship not in layout => should be pruned
      })
    });

    let model = makeModel({
      elements: { [e1.id]: e1, [e2.id]: e2 },
      relationships: { [rel.id]: rel },
      views: { [view.id]: view },
    });

    const recordTouched = jest.fn();
    const ops = createViewConnectionsOps({
      getModel: () => model,
      updateModel: (mutator) => {
        const next = clone(model);
        mutator(next);
        model = next;
      },
      recordTouched
    });

    ops.ensureViewConnections(view.id);

    const updated = model.views[view.id];
    expect(updated.connections).toEqual([]);
    expect(recordTouched).toHaveBeenCalledTimes(1);
  });
});
