import { makeModel } from "../../../../test/builders/modelBuilders";
import { createViewConnectionsOps } from "../viewConnectionsOps";
import { createViewRelationshipVisibilityOps } from "../viewRelationshipVisibilityOps";
import { makeElement, makeRelationship, makeView, makeViewLayout, makeViewNode, makeViewRelationshipLayout } from "../../../../test/builders/modelBuilders";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("viewRelationshipVisibilityOps", () => {
  test("hideRelationshipInView switches to explicit mode and prunes connections", () => {
    const e1 = makeElement({ name: "E1" });
    const e2 = makeElement({ name: "E2" });
    const rel = makeRelationship({
      type: "archimate:flow",
      sourceElementId: e1.id,
      targetElementId: e2.id,
    });

    const view = makeView({
      name: "V",
      // default relationshipVisibility from builder is mode: "all"
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
    const deps = {
      getModel: () => model,
      updateModel: (mutator: any) => {
        const next = clone(model);
        mutator(next);
        model = next;
      },
      recordTouched
    };

    const connectionsOps = createViewConnectionsOps(deps);
    const visibilityOps = createViewRelationshipVisibilityOps({ ...deps, ensureViewConnections: connectionsOps.ensureViewConnections });

    // Start with a materialized connection
    connectionsOps.ensureViewConnections(view.id);
    expect(model.views[view.id].connections).toHaveLength(1);

    visibilityOps.hideRelationshipInView(view.id, rel.id);

    const updated = model.views[view.id];
    expect(updated.relationshipVisibility.mode).toBe("explicit");
    expect(updated.relationshipVisibility.relationshipIds).not.toContain(rel.id);
    expect(updated.connections).toHaveLength(0);
    expect(recordTouched).toHaveBeenCalled();
  });

  test("showRelationshipInView adds relationship to explicit mode and ensures connections", () => {
    const e1 = makeElement({ name: "E1" });
    const e2 = makeElement({ name: "E2" });
    const rel = makeRelationship({
      type: "archimate:flow",
      sourceElementId: e1.id,
      targetElementId: e2.id,
    });

    const view = makeView({
      name: "V",
      relationshipVisibility: { mode: "explicit", relationshipIds: [] },
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
    const deps = {
      getModel: () => model,
      updateModel: (mutator: any) => {
        const next = clone(model);
        mutator(next);
        model = next;
      },
      recordTouched
    };

    const connectionsOps = createViewConnectionsOps(deps);
    const visibilityOps = createViewRelationshipVisibilityOps({ ...deps, ensureViewConnections: connectionsOps.ensureViewConnections });

    visibilityOps.showRelationshipInView(view.id, rel.id);

    const updated = model.views[view.id];
    expect(updated.relationshipVisibility.mode).toBe("explicit");
    expect(updated.relationshipVisibility.relationshipIds).toContain(rel.id);
    expect(updated.connections).toHaveLength(1);
    expect(updated.connections[0].relationshipId).toBe(rel.id);
    expect(recordTouched).toHaveBeenCalled();
  });
});
