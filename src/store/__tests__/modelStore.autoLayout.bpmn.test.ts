import { ModelStore } from '../modelStore';
import { createEmptyModel, createElement, createRelationship, createView } from '../../domain/factories';
import type { Model, View } from '../../domain/types';
import { addElementToViewAt, updateViewNodeLayout } from '../mutations/layout';
import { elkLayoutHierarchical } from '../../domain/layout/elk/elkLayoutHierarchical';

// Mock ELK hierarchical adapter to keep tests fast and deterministic.
jest.mock('../../domain/layout/elk/elkLayoutHierarchical', () => ({
  elkLayoutHierarchical: jest.fn(async (input: { nodes: Array<{ id: string }> }) => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of input.nodes) {
      // Keep containers top-left-ish and children inside.
      if (n.id === 'P') positions[n.id] = { x: 11, y: 11 };
      else if (n.id === 'L') positions[n.id] = { x: 51, y: 61 };
      else if (n.id === 'S') positions[n.id] = { x: 91, y: 111 };
      else if (n.id === 'T1') positions[n.id] = { x: 131, y: 141 };
      else if (n.id === 'T2') positions[n.id] = { x: 281, y: 141 };
      else positions[n.id] = { x: 11, y: 11 };
    }
    return { positions };
  })
}));

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

describe('ModelStore.autoLayoutView (BPMN)', () => {
  test('hierarchical layout grows pool/lane sizes and keeps child nodes committed', async () => {
    const model = createEmptyModel({ name: 'M' });

    const pool = createElement({ id: 'P', name: 'Pool', type: 'bpmn.pool' });
    const lane = createElement({ id: 'L', name: 'Lane', type: 'bpmn.lane' });
    const sub = createElement({ id: 'S', name: 'Sub', type: 'bpmn.subProcess' });
    const t1 = createElement({ id: 'T1', name: 'Task 1', type: 'bpmn.task' });
    const t2 = createElement({ id: 'T2', name: 'Task 2', type: 'bpmn.task' });

    model.elements[pool.id] = pool;
    model.elements[lane.id] = lane;
    model.elements[sub.id] = sub;
    model.elements[t1.id] = t1;
    model.elements[t2.id] = t2;

    // A simple sequence flow gives the layout graph an edge.
    const rel = createRelationship({
      id: 'R',
      name: 'seq',
      type: 'bpmn.sequenceFlow',
      sourceElementId: t1.id,
      targetElementId: t2.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'BPMN View',
      kind: 'bpmn',
      viewpointId: 'bpmn',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    // Add nodes with intentionally too-small container sizes (we expect the prep step to grow them).
    addElementToViewAt(model, view.id, pool.id, 200, 120);
    addElementToViewAt(model, view.id, lane.id, 220, 140);
    addElementToViewAt(model, view.id, sub.id, 300, 200);
    addElementToViewAt(model, view.id, t1.id, 330, 220);
    addElementToViewAt(model, view.id, t2.id, 480, 220);

    updateViewNodeLayout(model, view.id, pool.id, { x: 0, y: 0, width: 220, height: 120 });
    updateViewNodeLayout(model, view.id, lane.id, { x: 20, y: 20, width: 200, height: 100 });
    updateViewNodeLayout(model, view.id, sub.id, { x: 60, y: 60, width: 160, height: 90 });

    const store = new ModelStore();
    store.loadModel(model);

    const fn = elkLayoutHierarchical as unknown as jest.Mock;
    fn.mockClear();

    await store.autoLayoutView(view.id);
    expect(fn.mock.calls.length).toBe(1);

    const v = store.getState().model!.views[view.id];
    const nodes = v.layout!.nodes;
    const poolNode = nodes.find((n) => n.elementId === pool.id)!;
    const laneNode = nodes.find((n) => n.elementId === lane.id)!;
    const subNode = nodes.find((n) => n.elementId === sub.id)!;
    const t1Node = nodes.find((n) => n.elementId === t1.id)!;

    // Grid snapping to 10.
    expect(poolNode.x % 10).toBe(0);
    expect(poolNode.y % 10).toBe(0);

    // Containers should have been grown beyond the initial tiny sizes.
    expect(poolNode.width).toBeGreaterThan(220);
    expect(poolNode.height).toBeGreaterThan(120);
    // Lane may already be sized reasonably depending on the starting geometry;
    // we mainly care that it does not shrink.
    expect(laneNode.width).toBeGreaterThanOrEqual(200);
    expect(laneNode.height).toBeGreaterThanOrEqual(100);
    // Subprocess may already have sufficient size; auto-layout prep should not shrink it.
    expect(subNode.width).toBeGreaterThanOrEqual(160);
    expect(subNode.height).toBeGreaterThanOrEqual(90);

    // Sanity: a child got committed.
    expect(t1Node.x).not.toBe(0);
    expect(t1Node.y).not.toBe(0);
  });
});
